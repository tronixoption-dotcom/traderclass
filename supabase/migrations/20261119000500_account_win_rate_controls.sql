ALTER TABLE public.site_settings
  ADD COLUMN user_demo_win_rate_percent numeric(7,4) NOT NULL DEFAULT 50 CHECK (user_demo_win_rate_percent BETWEEN 0 AND 100),
  ADD COLUMN user_real_win_rate_percent numeric(7,4) NOT NULL DEFAULT 55.8824 CHECK (user_real_win_rate_percent BETWEEN 0 AND 100),
  ADD COLUMN agent_demo_win_rate_percent numeric(7,4) NOT NULL DEFAULT 50 CHECK (agent_demo_win_rate_percent BETWEEN 0 AND 100),
  ADD COLUMN agent_real_win_rate_percent numeric(7,4) NOT NULL DEFAULT 55.8824 CHECK (agent_real_win_rate_percent BETWEEN 0 AND 100);

UPDATE public.site_settings
SET user_real_win_rate_percent=real_win_rate_target_percent,
    agent_real_win_rate_percent=real_win_rate_target_percent
WHERE id=true;

ALTER TABLE public.site_settings DROP CONSTRAINT IF EXISTS site_settings_valid_payout_targets;
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_valid_payout_targets CHECK (
  (user_real_win_rate_percent IN (0,100) OR real_rtp_target_percent > user_real_win_rate_percent)
  AND (agent_real_win_rate_percent IN (0,100) OR real_rtp_target_percent > agent_real_win_rate_percent)
);

ALTER TABLE public.real_trades
  ADD COLUMN forced_win boolean NOT NULL DEFAULT false,
  ADD COLUMN win_rate_controlled boolean NOT NULL DEFAULT false;
ALTER TABLE public.real_trades DROP CONSTRAINT IF EXISTS real_trades_payout_multiplier_check;
ALTER TABLE public.real_trades ADD CONSTRAINT real_trades_payout_multiplier_check CHECK (payout_multiplier >= 1);

CREATE OR REPLACE FUNCTION public.open_real_trade(
  p_user_id uuid,p_symbol text,p_inst_id text,p_direction text,p_stake numeric,
  p_duration_seconds smallint,p_entry_price numeric,p_entry_price_ts bigint,p_request_id uuid,
  p_by_robot boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  cfg public.site_settings%ROWTYPE;
  current_balance numeric;
  profit numeric;
  multiplier numeric;
  win_rate numeric;
  trade_wins boolean;
  agent_account boolean;
  trade_id uuid;
  reserve_available numeric;
  reserve_locked numeric;
  stakes_locked numeric;
BEGIN
  IF p_user_id IS NULL OR p_direction NOT IN ('buy','sell') OR p_symbol<>p_inst_id THEN RAISE EXCEPTION 'Invalid trade request'; END IF;
  SELECT id INTO trade_id FROM public.real_trades WHERE request_id=p_request_id AND user_id=p_user_id;
  IF FOUND THEN RETURN trade_id; END IF;
  SELECT * INTO cfg FROM public.site_settings WHERE id=true;
  IF NOT FOUND OR NOT cfg.trading_enabled OR NOT cfg.real_trading_enabled OR (p_by_robot AND NOT cfg.robot_enabled) THEN RAISE EXCEPTION 'Live trading is currently unavailable'; END IF;
  IF p_duration_seconds NOT IN (5,10,15,30,60,120,300) THEN RAISE EXCEPTION 'Unsupported trade duration'; END IF;
  IF p_stake<cfg.real_min_stake OR (cfg.real_max_stake>0 AND p_stake>cfg.real_max_stake) OR round(p_stake,8)<>p_stake THEN RAISE EXCEPTION 'Stake is outside the configured live account limits'; END IF;
  IF p_entry_price<=0 OR p_entry_price_ts < (extract(epoch FROM clock_timestamp())*1000)::bigint-5000 OR p_entry_price_ts > (extract(epoch FROM clock_timestamp())*1000)::bigint+1000 THEN RAISE EXCEPTION 'The market quote is stale; request a fresh quote'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.funding_transactions WHERE user_id=p_user_id AND asset='USDT' AND kind='deposit' AND status='completed'
    UNION ALL SELECT 1 FROM public.mpesa_transactions WHERE user_id=p_user_id AND kind='deposit' AND status='completed'
  ) THEN RAISE EXCEPTION 'Complete a confirmed deposit before trading'; END IF;

  SELECT coalesce(agent_enabled,false) INTO agent_account FROM public.client_wallet_controls WHERE user_id=p_user_id;
  agent_account:=coalesce(agent_account,false);
  win_rate:=CASE WHEN agent_account THEN cfg.agent_real_win_rate_percent ELSE cfg.user_real_win_rate_percent END;
  trade_wins:=CASE WHEN win_rate<=0 THEN false WHEN win_rate>=100 THEN true ELSE random()*100<win_rate END;
  multiplier:=CASE WHEN win_rate<=0 THEN 1 ELSE greatest(1,round(cfg.real_rtp_target_percent/win_rate,8)) END;
  profit:=round(p_stake*(multiplier-1),8);

  INSERT INTO public.funding_wallets(user_id,asset) VALUES(p_user_id,'USDT') ON CONFLICT(user_id,asset) DO NOTHING;
  SELECT balance INTO current_balance FROM public.funding_wallets WHERE user_id=p_user_id AND asset='USDT' FOR UPDATE;
  IF current_balance<p_stake THEN RAISE EXCEPTION 'Insufficient available USDT balance'; END IF;
  IF p_by_robot AND EXISTS (SELECT 1 FROM public.real_trades WHERE user_id=p_user_id AND by_robot AND status='open') THEN RAISE EXCEPTION 'The live account Robot already has an open trade'; END IF;
  UPDATE public.real_trading_reserves SET available=available-profit,reserved_profit=reserved_profit+profit,reserved_stakes=reserved_stakes+p_stake,updated_at=now()
    WHERE asset='USDT' AND available>=profit RETURNING available,reserved_profit,reserved_stakes INTO reserve_available,reserve_locked,stakes_locked;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trading is paused because the payout reserve is insufficient'; END IF;
  UPDATE public.funding_wallets SET balance=balance-p_stake,updated_at=now() WHERE user_id=p_user_id AND asset='USDT';
  INSERT INTO public.real_trades(request_id,user_id,symbol,inst_id,direction,stake,entry_price,entry_price_ts,duration_seconds,payout_multiplier,reserved_profit,expires_at,by_robot,forced_win,win_rate_controlled)
    VALUES(p_request_id,p_user_id,p_symbol,p_symbol,p_direction,p_stake,p_entry_price,p_entry_price_ts,p_duration_seconds,multiplier,profit,clock_timestamp()+make_interval(secs=>p_duration_seconds),p_by_robot,trade_wins,true)
    RETURNING id INTO trade_id;
  INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after)
    VALUES('USDT',0,'profit_reserved',trade_id,'Payout reserve held for account win-rate settlement',reserve_available,reserve_locked,stakes_locked);
  RETURN trade_id;
END $$;
REVOKE ALL ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_real_trade(p_trade_id uuid,p_close_price numeric,p_close_candle_ts bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx public.real_trades%ROWTYPE; won boolean; result text; amount numeric; reserve_available numeric; reserve_locked numeric; stakes_locked numeric;
BEGIN
  SELECT * INTO tx FROM public.real_trades WHERE id=p_trade_id FOR UPDATE;
  IF NOT FOUND OR tx.status<>'open' THEN RETURN 'already_settled'; END IF;
  IF tx.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Trade has not expired'; END IF;
  IF p_close_price<=0 OR p_close_candle_ts<=0 THEN RAISE EXCEPTION 'Invalid settlement quote'; END IF;

  won:=CASE WHEN tx.win_rate_controlled THEN tx.forced_win
    WHEN p_close_price=tx.entry_price THEN false
    WHEN tx.direction='buy' THEN p_close_price>tx.entry_price
    ELSE p_close_price<tx.entry_price END;
  result:=CASE WHEN won THEN 'won' WHEN NOT tx.win_rate_controlled AND p_close_price=tx.entry_price THEN 'draw' ELSE 'lost' END;
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
    INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after) VALUES('USDT',-tx.reserved_profit,'profit_paid',tx.id,'Win-rate result paid; customer payout sent',reserve_available,reserve_locked,stakes_locked);
  ELSE
    UPDATE public.real_trading_reserves SET available=available+tx.reserved_profit,reserved_profit=reserved_profit-tx.reserved_profit,reserved_stakes=reserved_stakes-tx.stake,updated_at=now() WHERE asset='USDT' RETURNING available,reserved_profit,reserved_stakes INTO reserve_available,reserve_locked,stakes_locked;
    INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after) VALUES('USDT',0,'reserve_released',tx.id,'Payout reserve released and stake returned after a draw',reserve_available,reserve_locked,stakes_locked);
  END IF;
  UPDATE public.real_trades SET status=result,close_price=p_close_price,close_candle_ts=p_close_candle_ts,payout=amount,settled_at=now() WHERE id=tx.id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.settle_real_trade(uuid,numeric,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_real_trade(uuid,numeric,bigint) TO service_role;
