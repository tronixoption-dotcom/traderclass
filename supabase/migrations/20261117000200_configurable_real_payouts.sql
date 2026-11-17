ALTER TABLE public.site_settings
  ADD COLUMN real_rtp_target_percent numeric(5,2) NOT NULL DEFAULT 95.00 CHECK (real_rtp_target_percent BETWEEN 1 AND 100),
  ADD COLUMN real_win_rate_target_percent numeric(7,4) NOT NULL DEFAULT 55.8824 CHECK (real_win_rate_target_percent BETWEEN 1 AND 100),
  ADD COLUMN real_pricing_model text NOT NULL DEFAULT 'standard' CHECK (real_pricing_model IN ('standard','conservative','aggressive','custom')),
  ADD CONSTRAINT site_settings_valid_payout_targets CHECK (
    real_rtp_target_percent > real_win_rate_target_percent
    AND real_rtp_target_percent / real_win_rate_target_percent <= 10
  );

ALTER TABLE public.real_trades
  ALTER COLUMN payout_multiplier TYPE numeric(8,4) USING payout_multiplier::numeric(8,4);
ALTER TABLE public.real_trades DROP CONSTRAINT IF EXISTS real_trades_payout_multiplier_check;
ALTER TABLE public.real_trades ADD CONSTRAINT real_trades_payout_multiplier_check
  CHECK (payout_multiplier > 1 AND payout_multiplier <= 10);

CREATE OR REPLACE FUNCTION public.open_real_trade(
  p_user_id uuid,p_symbol text,p_inst_id text,p_direction text,p_stake numeric,
  p_duration_seconds smallint,p_entry_price numeric,p_entry_price_ts bigint,p_request_id uuid,
  p_by_robot boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.site_settings%ROWTYPE; current_balance numeric; profit numeric; multiplier numeric; trade_id uuid; expected_inst text; reserve_available numeric; reserve_locked numeric; stakes_locked numeric;
BEGIN
  IF p_user_id IS NULL OR p_direction NOT IN ('buy','sell') THEN RAISE EXCEPTION 'Invalid trade request'; END IF;
  SELECT id INTO trade_id FROM public.real_trades WHERE request_id=p_request_id AND user_id=p_user_id;
  IF FOUND THEN RETURN trade_id; END IF;
  expected_inst:=CASE p_symbol
    WHEN 'BTCUSD' THEN 'BTC-USDT' WHEN 'ETHUSD' THEN 'ETH-USDT' WHEN 'SOLUSD' THEN 'SOL-USDT'
    WHEN 'XRPUSD' THEN 'XRP-USDT' WHEN 'ADAUSD' THEN 'ADA-USDT' WHEN 'DOGEUSD' THEN 'DOGE-USDT'
    WHEN 'LTCUSD' THEN 'LTC-USDT' WHEN 'BCHUSD' THEN 'BCH-USDT' WHEN 'LINKUSD' THEN 'LINK-USDT'
    WHEN 'AVAXUSD' THEN 'AVAX-USDT' WHEN 'TRXUSD' THEN 'TRX-USDT' WHEN 'DOTUSD' THEN 'DOT-USDT'
    WHEN 'TONUSD' THEN 'TON-USDT' WHEN 'XLMUSD' THEN 'XLM-USDT' WHEN 'UNIUSD' THEN 'UNI-USDT'
    WHEN 'ATOMUSD' THEN 'ATOM-USDT' WHEN 'NEARUSD' THEN 'NEAR-USDT' WHEN 'APTUSD' THEN 'APT-USDT'
    WHEN 'SUIUSD' THEN 'SUI-USDT' WHEN 'ETCUSD' THEN 'ETC-USDT' WHEN 'FILUSD' THEN 'FIL-USDT'
    WHEN 'AAVEUSD' THEN 'AAVE-USDT' WHEN 'ALGOUSD' THEN 'ALGO-USDT' ELSE NULL END;
  IF expected_inst IS NULL OR expected_inst<>p_inst_id THEN RAISE EXCEPTION 'This instrument is not available for live trading'; END IF;
  SELECT * INTO cfg FROM public.site_settings WHERE id=true;
  IF NOT FOUND OR NOT cfg.trading_enabled OR NOT cfg.real_trading_enabled OR (p_by_robot AND NOT cfg.robot_enabled) THEN RAISE EXCEPTION 'Live trading is currently unavailable'; END IF;
  IF p_duration_seconds NOT IN (5,10,15,30,60,120,300) THEN RAISE EXCEPTION 'Unsupported trade duration'; END IF;
  IF p_stake<cfg.real_min_stake OR p_stake>cfg.real_max_stake OR round(p_stake,8)<>p_stake THEN RAISE EXCEPTION 'Stake is outside the configured live account limits'; END IF;
  IF p_entry_price<=0 OR p_entry_price_ts < (extract(epoch FROM clock_timestamp())*1000)::bigint-5000 OR p_entry_price_ts > (extract(epoch FROM clock_timestamp())*1000)::bigint+1000 THEN RAISE EXCEPTION 'The OKX quote is stale; request a fresh quote'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.funding_transactions WHERE user_id=p_user_id AND asset='USDT' AND kind='deposit' AND status='completed') THEN RAISE EXCEPTION 'Complete a confirmed USDT deposit before live trading'; END IF;
  multiplier:=round(cfg.real_rtp_target_percent/cfg.real_win_rate_target_percent,4);
  IF multiplier<=1 OR multiplier>10 THEN RAISE EXCEPTION 'Configured payout targets produce an unsupported multiplier'; END IF;
  profit:=round(p_stake*(multiplier-1),8);
  INSERT INTO public.funding_wallets(user_id,asset) VALUES(p_user_id,'USDT') ON CONFLICT(user_id,asset) DO NOTHING;
  SELECT balance INTO current_balance FROM public.funding_wallets WHERE user_id=p_user_id AND asset='USDT' FOR UPDATE;
  IF current_balance<p_stake THEN RAISE EXCEPTION 'Insufficient available USDT balance'; END IF;
  IF p_by_robot AND EXISTS (SELECT 1 FROM public.real_trades WHERE user_id=p_user_id AND by_robot AND status='open') THEN RAISE EXCEPTION 'The live account Robot already has an open trade'; END IF;
  UPDATE public.real_trading_reserves SET available=available-profit,reserved_profit=reserved_profit+profit,reserved_stakes=reserved_stakes+p_stake,updated_at=now()
    WHERE asset='USDT' AND available>=profit RETURNING available,reserved_profit,reserved_stakes INTO reserve_available,reserve_locked,stakes_locked;
  IF NOT FOUND THEN RAISE EXCEPTION 'Real trading is paused because payout reserve is insufficient'; END IF;
  UPDATE public.funding_wallets SET balance=balance-p_stake,updated_at=now() WHERE user_id=p_user_id AND asset='USDT';
  INSERT INTO public.real_trades(request_id,user_id,symbol,inst_id,direction,stake,entry_price,entry_price_ts,duration_seconds,payout_multiplier,reserved_profit,expires_at,by_robot)
    VALUES(p_request_id,p_user_id,p_symbol,p_inst_id,p_direction,p_stake,p_entry_price,p_entry_price_ts,p_duration_seconds,multiplier,profit,clock_timestamp()+make_interval(secs=>p_duration_seconds),p_by_robot)
    RETURNING id INTO trade_id;
  INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after)
    VALUES('USDT',0,'profit_reserved',trade_id,'Maximum payout profit reserved for settlement',reserve_available,reserve_locked,stakes_locked);
  RETURN trade_id;
END $$;
REVOKE ALL ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid,boolean) TO service_role;
