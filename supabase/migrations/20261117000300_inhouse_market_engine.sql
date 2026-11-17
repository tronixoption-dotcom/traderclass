-- Remove application-imposed trade ceilings. Storage precision, account balance,
-- and the funded payout reserve remain the natural limits.
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_real_min_stake_check;
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_real_max_stake_check;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_real_min_stake_check CHECK (real_min_stake > 0);
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_real_max_stake_check CHECK (real_max_stake=0 OR real_max_stake >= real_min_stake);
ALTER TABLE public.site_settings ALTER COLUMN real_max_stake SET DEFAULT 0;
UPDATE public.site_settings SET real_max_stake=0 WHERE id=true;
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_real_rtp_target_percent_check;
ALTER TABLE public.site_settings ALTER COLUMN real_rtp_target_percent TYPE numeric(20,8) USING real_rtp_target_percent::numeric(20,8);
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_real_rtp_target_percent_check CHECK (real_rtp_target_percent > 0);
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_fraud_max_trades_per_minute_check;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_fraud_max_trades_per_minute_check CHECK (fraud_max_trades_per_minute > 0);
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_deposit_fee_percent_check;
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_withdrawal_fee_percent_check;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_deposit_fee_percent_check CHECK (deposit_fee_percent BETWEEN 0 AND 99.99);
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_withdrawal_fee_percent_check CHECK (withdrawal_fee_percent BETWEEN 0 AND 99.99);
UPDATE public.site_settings SET deposit_fee_percent=least(deposit_fee_percent,99.99), withdrawal_fee_percent=least(withdrawal_fee_percent,99.99) WHERE id=true;
ALTER TABLE public.real_trades ALTER COLUMN payout_multiplier TYPE numeric(20,8) USING payout_multiplier::numeric(20,8);
ALTER TABLE public.real_trades DROP CONSTRAINT IF EXISTS real_trades_payout_multiplier_check;
ALTER TABLE public.real_trades ADD CONSTRAINT real_trades_payout_multiplier_check CHECK (payout_multiplier > 1);
ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_valid_payout_targets;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_valid_payout_targets
  CHECK (real_rtp_target_percent > real_win_rate_target_percent);
ALTER TABLE public.site_settings ALTER COLUMN fraud_detection_enabled SET DEFAULT false;
UPDATE public.site_settings SET real_rtp_target_percent=95,real_win_rate_target_percent=55.8824,
  real_pricing_model='standard',fraud_detection_enabled=false, real_daily_loss_cap=0,
  real_weekly_loss_cap=0, real_monthly_loss_cap=0, real_market_exposure_cap=0,
  real_user_exposure_cap=0 WHERE id=true;

CREATE TABLE public.inhouse_market_ticks (
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9]{3,16}$'),
  tick_at timestamptz NOT NULL,
  price numeric(30,12) NOT NULL CHECK (price > 0),
  PRIMARY KEY(symbol,tick_at)
);
CREATE INDEX inhouse_market_ticks_time_idx ON public.inhouse_market_ticks(tick_at DESC);
ALTER TABLE public.inhouse_market_ticks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.inhouse_market_ticks TO service_role;

CREATE OR REPLACE FUNCTION public.advance_inhouse_market(
  p_symbol text,p_base_price numeric,p_volatility numeric,p_until timestamptz DEFAULT clock_timestamp()
) RETURNS TABLE(tick_at timestamptz,price numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_at timestamptz; last_price numeric; target_at timestamptz; step_at timestamptz; step_return numeric;
BEGIN
  IF p_symbol !~ '^[A-Z0-9]{3,16}$' OR p_base_price<=0 OR p_volatility<=0 OR p_volatility>0.01 THEN
    RAISE EXCEPTION 'Invalid in-house market configuration';
  END IF;
  target_at:=to_timestamp(floor(extract(epoch FROM p_until)));
  PERFORM pg_advisory_xact_lock(hashtextextended('inhouse-market:'||p_symbol,0));
  SELECT t.tick_at,t.price INTO last_at,last_price FROM public.inhouse_market_ticks t
    WHERE t.symbol=p_symbol ORDER BY t.tick_at DESC LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.inhouse_market_ticks(symbol,tick_at,price) VALUES(p_symbol,target_at,p_base_price)
      ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT t.tick_at,t.price FROM public.inhouse_market_ticks t WHERE t.symbol=p_symbol AND t.tick_at=target_at;
    RETURN;
  END IF;
  IF last_at>target_at THEN
    RETURN QUERY SELECT t.tick_at,t.price FROM public.inhouse_market_ticks t WHERE t.symbol=p_symbol AND t.tick_at<=target_at ORDER BY t.tick_at DESC LIMIT 1;
    RETURN;
  END IF;
  -- Large idle gaps are anchored at the last known quote; active contracts are
  -- at most five minutes long and are advanced second-by-second for settlement.
  IF target_at-last_at>interval '1 hour' THEN
    last_at:=target_at-interval '1 hour';
    INSERT INTO public.inhouse_market_ticks(symbol,tick_at,price) VALUES(p_symbol,last_at,last_price)
      ON CONFLICT(symbol,tick_at) DO UPDATE SET price=EXCLUDED.price;
  END IF;
  step_at:=last_at+interval '1 second';
  WHILE step_at<=target_at LOOP
    step_return:=((random()*2)-1)*p_volatility;
    last_price:=greatest(0.000000000001,last_price*(1+step_return));
    INSERT INTO public.inhouse_market_ticks(symbol,tick_at,price) VALUES(p_symbol,step_at,last_price)
      ON CONFLICT(symbol,tick_at) DO NOTHING;
    SELECT t.price INTO last_price FROM public.inhouse_market_ticks t WHERE t.symbol=p_symbol AND t.tick_at=step_at;
    step_at:=step_at+interval '1 second';
  END LOOP;
  DELETE FROM public.inhouse_market_ticks t WHERE t.symbol=p_symbol
    AND t.tick_at<target_at-interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM public.real_trades r WHERE r.symbol=t.symbol AND r.status='open'
      AND t.tick_at BETWEEN date_trunc('second',r.created_at) AND date_trunc('second',r.expires_at));
  RETURN QUERY SELECT t.tick_at,t.price FROM public.inhouse_market_ticks t WHERE t.symbol=p_symbol AND t.tick_at=target_at;
END $$;
REVOKE ALL ON FUNCTION public.advance_inhouse_market(text,numeric,numeric,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_inhouse_market(text,numeric,numeric,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_real_trade(p_trade_id uuid,p_close_price numeric,p_close_candle_ts bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx public.real_trades%ROWTYPE; won boolean; result text; amount numeric; reserve_available numeric; reserve_locked numeric; stakes_locked numeric;
BEGIN
  SELECT * INTO tx FROM public.real_trades WHERE id=p_trade_id FOR UPDATE;
  IF NOT FOUND OR tx.status<>'open' THEN RETURN 'already_settled'; END IF;
  IF tx.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Trade has not expired'; END IF;
  IF p_close_price<=0 OR p_close_candle_ts+1000 < (extract(epoch FROM tx.expires_at)*1000)::bigint OR p_close_candle_ts+1000 > (extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'Invalid or incomplete in-house settlement tick'; END IF;
  won:=CASE WHEN p_close_price=tx.entry_price THEN false WHEN tx.direction='buy' THEN p_close_price>tx.entry_price ELSE p_close_price<tx.entry_price END;
  result:=CASE WHEN p_close_price=tx.entry_price THEN 'draw' WHEN won THEN 'won' ELSE 'lost' END;
  amount:=CASE WHEN result='won' THEN round(tx.stake*tx.payout_multiplier,8) WHEN result='draw' THEN tx.stake ELSE 0 END;
  IF result IN ('won','draw') THEN
    INSERT INTO public.funding_wallets(user_id,asset,balance) VALUES(tx.user_id,'USDT',amount)
      ON CONFLICT(user_id,asset) DO UPDATE SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();
  END IF;
  IF result='lost' THEN
    UPDATE public.real_trading_reserves SET available=available+tx.reserved_profit+tx.stake,reserved_profit=reserved_profit-tx.reserved_profit,reserved_stakes=reserved_stakes-tx.stake,updated_at=now() WHERE asset='USDT' RETURNING available,reserved_profit,reserved_stakes INTO reserve_available,reserve_locked,stakes_locked;
    INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after) VALUES('USDT',tx.stake,'trade_loss',tx.id,'Customer stake settled as loss',reserve_available,reserve_locked,stakes_locked);
    INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after) VALUES('USDT',0,'reserve_released',tx.id,'Unused profit reserve released after a loss',reserve_available,reserve_locked,stakes_locked);
  ELSIF result='won' THEN
    UPDATE public.real_trading_reserves SET reserved_profit=reserved_profit-tx.reserved_profit,reserved_stakes=reserved_stakes-tx.stake,updated_at=now() WHERE asset='USDT' RETURNING available,reserved_profit,reserved_stakes INTO reserve_available,reserve_locked,stakes_locked;
    INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after) VALUES('USDT',-tx.reserved_profit,'profit_paid',tx.id,'Reserved profit paid; customer stake returned',reserve_available,reserve_locked,stakes_locked);
  ELSE
    UPDATE public.real_trading_reserves SET available=available+tx.reserved_profit,reserved_profit=reserved_profit-tx.reserved_profit,reserved_stakes=reserved_stakes-tx.stake,updated_at=now() WHERE asset='USDT' RETURNING available,reserved_profit,reserved_stakes INTO reserve_available,reserve_locked,stakes_locked;
    INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after) VALUES('USDT',0,'reserve_released',tx.id,'Payout reserve released and stake returned after a draw',reserve_available,reserve_locked,stakes_locked);
  END IF;
  UPDATE public.real_trades SET status=result,close_price=p_close_price,close_candle_ts=p_close_candle_ts,payout=amount,settled_at=now() WHERE id=tx.id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.settle_real_trade(uuid,numeric,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_real_trade(uuid,numeric,bigint) TO service_role;

-- Seed active legacy trades at their recorded entry so they can settle from the
-- new shared in-house series without changing their entry price or payout terms.
INSERT INTO public.inhouse_market_ticks(symbol,tick_at,price)
SELECT DISTINCT ON (symbol) symbol,date_trunc('second',created_at),entry_price
FROM public.real_trades WHERE status='open'
ORDER BY symbol,created_at
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.open_real_trade(
  p_user_id uuid,p_symbol text,p_inst_id text,p_direction text,p_stake numeric,
  p_duration_seconds smallint,p_entry_price numeric,p_entry_price_ts bigint,p_request_id uuid,
  p_by_robot boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.site_settings%ROWTYPE; current_balance numeric; profit numeric; multiplier numeric; trade_id uuid; reserve_available numeric; reserve_locked numeric; stakes_locked numeric;
BEGIN
  IF p_user_id IS NULL OR p_direction NOT IN ('buy','sell') OR p_symbol<>p_inst_id THEN RAISE EXCEPTION 'Invalid trade request'; END IF;
  SELECT id INTO trade_id FROM public.real_trades WHERE request_id=p_request_id AND user_id=p_user_id;
  IF FOUND THEN RETURN trade_id; END IF;
  SELECT * INTO cfg FROM public.site_settings WHERE id=true;
  IF NOT FOUND OR NOT cfg.trading_enabled OR NOT cfg.real_trading_enabled OR (p_by_robot AND NOT cfg.robot_enabled) THEN RAISE EXCEPTION 'Live trading is currently unavailable'; END IF;
  IF p_duration_seconds NOT IN (5,10,15,30,60,120,300) THEN RAISE EXCEPTION 'Unsupported trade duration'; END IF;
  IF p_stake<cfg.real_min_stake OR (cfg.real_max_stake>0 AND p_stake>cfg.real_max_stake) OR round(p_stake,8)<>p_stake THEN RAISE EXCEPTION 'Stake is outside the configured live account limits'; END IF;
  IF p_entry_price<=0 OR p_entry_price_ts < (extract(epoch FROM clock_timestamp())*1000)::bigint-5000 OR p_entry_price_ts > (extract(epoch FROM clock_timestamp())*1000)::bigint+1000 THEN RAISE EXCEPTION 'The in-house market quote is stale; request a fresh quote'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.funding_transactions WHERE user_id=p_user_id AND asset='USDT' AND kind='deposit' AND status='completed') THEN RAISE EXCEPTION 'Complete a confirmed USDT deposit before trading'; END IF;
  multiplier:=round(cfg.real_rtp_target_percent/cfg.real_win_rate_target_percent,8);
  IF multiplier<=1 THEN RAISE EXCEPTION 'Payout settings must produce a multiplier above 1'; END IF;
  profit:=round(p_stake*(multiplier-1),8);
  INSERT INTO public.funding_wallets(user_id,asset) VALUES(p_user_id,'USDT') ON CONFLICT(user_id,asset) DO NOTHING;
  SELECT balance INTO current_balance FROM public.funding_wallets WHERE user_id=p_user_id AND asset='USDT' FOR UPDATE;
  IF current_balance<p_stake THEN RAISE EXCEPTION 'Insufficient available USDT balance'; END IF;
  IF p_by_robot AND EXISTS (SELECT 1 FROM public.real_trades WHERE user_id=p_user_id AND by_robot AND status='open') THEN RAISE EXCEPTION 'The live account Robot already has an open trade'; END IF;
  UPDATE public.real_trading_reserves SET available=available-profit,reserved_profit=reserved_profit+profit,reserved_stakes=reserved_stakes+p_stake,updated_at=now()
    WHERE asset='USDT' AND available>=profit RETURNING available,reserved_profit,reserved_stakes INTO reserve_available,reserve_locked,stakes_locked;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trading is paused because the payout reserve is insufficient'; END IF;
  UPDATE public.funding_wallets SET balance=balance-p_stake,updated_at=now() WHERE user_id=p_user_id AND asset='USDT';
  INSERT INTO public.real_trades(request_id,user_id,symbol,inst_id,direction,stake,entry_price,entry_price_ts,duration_seconds,payout_multiplier,reserved_profit,expires_at,by_robot)
    VALUES(p_request_id,p_user_id,p_symbol,p_symbol,p_direction,p_stake,p_entry_price,p_entry_price_ts,p_duration_seconds,multiplier,profit,clock_timestamp()+make_interval(secs=>p_duration_seconds),p_by_robot)
    RETURNING id INTO trade_id;
  INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after)
    VALUES('USDT',0,'profit_reserved',trade_id,'Payout reserve held for in-house market settlement',reserve_available,reserve_locked,stakes_locked);
  RETURN trade_id;
END $$;
REVOKE ALL ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid,boolean) TO service_role;
