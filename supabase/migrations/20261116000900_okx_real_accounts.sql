ALTER TABLE public.site_settings
  ADD COLUMN real_trading_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN real_min_stake numeric(20,8) NOT NULL DEFAULT 1 CHECK (real_min_stake > 0 AND real_min_stake <= 100000),
  ADD COLUMN real_max_stake numeric(20,8) NOT NULL DEFAULT 100 CHECK (real_max_stake >= real_min_stake AND real_max_stake <= 100000);

CREATE TABLE public.real_trading_reserves (
  asset text PRIMARY KEY CHECK (asset = 'USDT'),
  available numeric(20,8) NOT NULL DEFAULT 0 CHECK (available >= 0),
  reserved_profit numeric(20,8) NOT NULL DEFAULT 0 CHECK (reserved_profit >= 0),
  reserved_stakes numeric(20,8) NOT NULL DEFAULT 0 CHECK (reserved_stakes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.real_trading_reserves(asset) VALUES ('USDT');

CREATE TABLE public.real_trading_reserve_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL CHECK (asset = 'USDT'),
  amount numeric(20,8) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('admin_adjustment','profit_reserved','trade_loss','profit_paid','reserve_released')),
  available_after numeric(20,8) NOT NULL,
  reserved_profit_after numeric(20,8) NOT NULL,
  reserved_stakes_after numeric(20,8) NOT NULL,
  reference_id uuid,
  note text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.real_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  inst_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('buy','sell')),
  asset text NOT NULL DEFAULT 'USDT' CHECK (asset = 'USDT'),
  stake numeric(20,8) NOT NULL CHECK (stake > 0),
  entry_price numeric(30,12) NOT NULL CHECK (entry_price > 0),
  entry_price_ts bigint NOT NULL,
  duration_seconds smallint NOT NULL CHECK (duration_seconds IN (5,10,15,30,60,120,300)),
  payout_multiplier numeric(5,2) NOT NULL DEFAULT 1.70 CHECK (payout_multiplier = 1.70),
  reserved_profit numeric(20,8) NOT NULL CHECK (reserved_profit >= 0),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','draw')),
  close_price numeric(30,12),
  close_candle_ts bigint,
  payout numeric(20,8) NOT NULL DEFAULT 0 CHECK (payout >= 0),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX real_trades_user_created_idx ON public.real_trades(user_id,created_at DESC);
CREATE INDEX real_trades_due_idx ON public.real_trades(expires_at) WHERE status='open';

ALTER TABLE public.real_trading_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.real_trading_reserve_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.real_trades ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.real_trading_reserves,public.real_trading_reserve_ledger,public.real_trades TO authenticated;
GRANT ALL ON public.real_trading_reserves,public.real_trading_reserve_ledger,public.real_trades TO service_role;
CREATE POLICY "Admins read real trading reserves" ON public.real_trading_reserves FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read real reserve ledger" ON public.real_trading_reserve_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users read own real trades" ON public.real_trades FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Staff read real trades" ON public.real_trades FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent'));

CREATE OR REPLACE FUNCTION public.open_real_trade(
  p_user_id uuid,p_symbol text,p_inst_id text,p_direction text,p_stake numeric,
  p_duration_seconds smallint,p_entry_price numeric,p_entry_price_ts bigint,p_request_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.site_settings%ROWTYPE; current_balance numeric; profit numeric; trade_id uuid; expected_inst text; reserve_available numeric; reserve_locked numeric; stakes_locked numeric;
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
  IF expected_inst IS NULL OR expected_inst<>p_inst_id THEN RAISE EXCEPTION 'This instrument is not available for real trading'; END IF;
  SELECT * INTO cfg FROM public.site_settings WHERE id=true;
  IF NOT FOUND OR NOT cfg.trading_enabled OR NOT cfg.real_trading_enabled THEN RAISE EXCEPTION 'Real trading is currently unavailable'; END IF;
  IF p_duration_seconds NOT IN (5,10,15,30,60,120,300) THEN RAISE EXCEPTION 'Unsupported trade duration'; END IF;
  IF p_stake<cfg.real_min_stake OR p_stake>cfg.real_max_stake OR round(p_stake,8)<>p_stake THEN RAISE EXCEPTION 'Stake is outside the configured real account limits'; END IF;
  IF p_entry_price<=0 OR p_entry_price_ts < (extract(epoch FROM clock_timestamp())*1000)::bigint-5000 OR p_entry_price_ts > (extract(epoch FROM clock_timestamp())*1000)::bigint+1000 THEN RAISE EXCEPTION 'The OKX quote is stale; request a fresh quote'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.funding_transactions WHERE user_id=p_user_id AND asset='USDT' AND kind='deposit' AND status='completed') THEN RAISE EXCEPTION 'Complete a confirmed USDT deposit before real trading'; END IF;
  profit:=round(p_stake*0.70,8);
  INSERT INTO public.funding_wallets(user_id,asset) VALUES(p_user_id,'USDT') ON CONFLICT(user_id,asset) DO NOTHING;
  SELECT balance INTO current_balance FROM public.funding_wallets WHERE user_id=p_user_id AND asset='USDT' FOR UPDATE;
  IF current_balance<p_stake THEN RAISE EXCEPTION 'Insufficient available USDT balance'; END IF;
  UPDATE public.real_trading_reserves SET available=available-profit,reserved_profit=reserved_profit+profit,reserved_stakes=reserved_stakes+p_stake,updated_at=now()
    WHERE asset='USDT' AND available>=profit RETURNING available,reserved_profit,reserved_stakes INTO reserve_available,reserve_locked,stakes_locked;
  IF NOT FOUND THEN RAISE EXCEPTION 'Real trading is paused because payout reserve is insufficient'; END IF;
  UPDATE public.funding_wallets SET balance=balance-p_stake,updated_at=now() WHERE user_id=p_user_id AND asset='USDT';
  INSERT INTO public.real_trades(request_id,user_id,symbol,inst_id,direction,stake,entry_price,entry_price_ts,duration_seconds,reserved_profit,expires_at)
    VALUES(p_request_id,p_user_id,p_symbol,p_inst_id,p_direction,p_stake,p_entry_price,p_entry_price_ts,p_duration_seconds,profit,clock_timestamp()+make_interval(secs=>p_duration_seconds))
    RETURNING id INTO trade_id;
  INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,reference_id,note,available_after,reserved_profit_after,reserved_stakes_after)
    VALUES('USDT',0,'profit_reserved',trade_id,'Maximum profit and customer stake reserved for settlement',reserve_available,reserve_locked,stakes_locked);
  RETURN trade_id;
END $$;
REVOKE ALL ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_real_trade(p_trade_id uuid,p_close_price numeric,p_close_candle_ts bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx public.real_trades%ROWTYPE; won boolean; result text; amount numeric; reserve_available numeric; reserve_locked numeric; stakes_locked numeric;
BEGIN
  SELECT * INTO tx FROM public.real_trades WHERE id=p_trade_id FOR UPDATE;
  IF NOT FOUND OR tx.status<>'open' THEN RETURN 'already_settled'; END IF;
  IF tx.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Trade has not expired'; END IF;
  IF p_close_price<=0 OR p_close_candle_ts+1000 < (extract(epoch FROM tx.expires_at)*1000)::bigint OR p_close_candle_ts+1000 > (extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'Invalid or incomplete OKX settlement candle'; END IF;
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

CREATE OR REPLACE FUNCTION public.adjust_real_trading_reserve(p_actor_id uuid,p_delta numeric,p_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_value numeric; locked_value numeric; stakes_locked numeric;
BEGIN
  IF NOT public.has_role(p_actor_id,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_delta=0 OR abs(p_delta)>100000000 OR length(trim(coalesce(p_note,'')))<8 THEN RAISE EXCEPTION 'Enter a valid reserve change and note'; END IF;
  UPDATE public.real_trading_reserves SET available=available+p_delta,updated_at=now() WHERE asset='USDT' AND available+p_delta>=0 RETURNING available,reserved_profit,reserved_stakes INTO next_value,locked_value,stakes_locked;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserve adjustment would make available payout funds negative'; END IF;
  INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,note,actor_id,available_after,reserved_profit_after,reserved_stakes_after) VALUES('USDT',p_delta,'admin_adjustment',left(trim(p_note),300),p_actor_id,next_value,locked_value,stakes_locked);
  RETURN next_value;
END $$;
REVOKE ALL ON FUNCTION public.adjust_real_trading_reserve(uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_real_trading_reserve(uuid,numeric,text) TO service_role;
