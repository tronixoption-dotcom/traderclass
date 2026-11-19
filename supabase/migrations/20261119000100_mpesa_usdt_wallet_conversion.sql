-- Keep one tradable USDT wallet while allowing KES M-Pesa on-ramp and off-ramp.
ALTER TABLE public.site_settings
  ADD COLUMN kes_per_usdt numeric(12,4) NOT NULL DEFAULT 130.0500
  CHECK (kes_per_usdt BETWEEN 1 AND 10000);

ALTER TABLE public.mpesa_transactions
  ADD COLUMN conversion_rate numeric(12,4),
  ADD COLUMN converted_usdt numeric(20,8),
  ADD COLUMN source_asset text NOT NULL DEFAULT 'KES' CHECK (source_asset IN ('KES','USDT')),
  ADD COLUMN source_amount_usdt numeric(20,8) CHECK (source_amount_usdt IS NULL OR source_amount_usdt > 0);

-- Move any existing M-Pesa wallet value into the same USDT wallet used by live trades.
INSERT INTO public.funding_wallets(user_id,asset,balance)
SELECT w.user_id,'USDT',round(w.balance_kes/s.kes_per_usdt,8)
FROM public.mpesa_wallets w CROSS JOIN public.site_settings s
WHERE s.id=true AND w.balance_kes>0
ON CONFLICT(user_id,asset) DO UPDATE
SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();

INSERT INTO public.funding_transactions(user_id,method_name,kind,asset,amount,status,admin_note,reviewed_at,fee_amount,net_amount)
SELECT w.user_id,'M-Pesa balance conversion','deposit','USDT',round(w.balance_kes/s.kes_per_usdt,8),'completed',
  'Existing KES wallet converted at '||s.kes_per_usdt||' KES per USDT during wallet unification.',now(),0,
  round(w.balance_kes/s.kes_per_usdt,8)
FROM public.mpesa_wallets w CROSS JOIN public.site_settings s
WHERE s.id=true AND w.balance_kes>0;

UPDATE public.mpesa_transactions t SET conversion_rate=s.kes_per_usdt
FROM public.site_settings s
WHERE s.id=true AND t.kind='withdrawal' AND t.status='processing'
  AND t.source_asset='KES' AND t.conversion_rate IS NULL;

UPDATE public.mpesa_wallets SET balance_kes=0,updated_at=now() WHERE balance_kes>0;

CREATE OR REPLACE FUNCTION public.request_usdt_mpesa_withdrawal(
  p_user_id uuid,p_amount_usdt numeric,p_phone_number text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx_id uuid; fx numeric; fee_rate numeric; amount_kes bigint; fee_kes bigint; net_kes bigint;
BEGIN
  IF p_user_id IS NULL OR p_amount_usdt IS NULL OR p_amount_usdt<=0 OR round(p_amount_usdt,8)<>p_amount_usdt THEN
    RAISE EXCEPTION 'Enter a valid USDT withdrawal amount';
  END IF;
  IF length(trim(coalesce(p_phone_number,'')))<9 OR length(trim(p_phone_number))>16 THEN
    RAISE EXCEPTION 'Enter a valid M-Pesa phone number';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id=true AND withdrawals_enabled) THEN
    RAISE EXCEPTION 'Withdrawals are currently paused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_wallet_controls WHERE user_id=p_user_id AND NOT withdrawals_enabled) THEN
    RAISE EXCEPTION 'Withdrawals are disabled for this account';
  END IF;
  SELECT kes_per_usdt,coalesce(withdrawal_fee_percent,0) INTO fx,fee_rate FROM public.site_settings WHERE id=true;
  IF fx IS NULL OR fx<=0 THEN RAISE EXCEPTION 'M-Pesa exchange rate is unavailable'; END IF;
  amount_kes:=round(p_amount_usdt*fx);
  fee_kes:=round(amount_kes*fee_rate/100);
  net_kes:=amount_kes-fee_kes;
  IF amount_kes<1 OR amount_kes>150000 OR net_kes<1 THEN
    RAISE EXCEPTION 'Withdrawal converts outside the supported M-Pesa payout limits';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.funding_transactions WHERE user_id=p_user_id AND kind='deposit' AND status='completed'
    UNION ALL SELECT 1 FROM public.mpesa_transactions WHERE user_id=p_user_id AND kind='deposit' AND status='completed'
  ) THEN RAISE EXCEPTION 'Make one successful deposit to activate withdrawals'; END IF;
  INSERT INTO public.funding_wallets(user_id,asset) VALUES(p_user_id,'USDT') ON CONFLICT(user_id,asset) DO NOTHING;
  UPDATE public.funding_wallets SET balance=balance-p_amount_usdt,updated_at=now()
    WHERE user_id=p_user_id AND asset='USDT' AND balance>=p_amount_usdt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient USDT wallet balance'; END IF;
  INSERT INTO public.mpesa_transactions(user_id,kind,status,amount_kes,phone_number,fee_amount_kes,net_amount_kes,
    conversion_rate,source_asset,source_amount_usdt)
  VALUES(p_user_id,'withdrawal','processing',amount_kes,trim(p_phone_number),fee_kes,net_kes,fx,'USDT',p_amount_usdt)
  RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;
REVOKE ALL ON FUNCTION public.request_usdt_mpesa_withdrawal(uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_usdt_mpesa_withdrawal(uuid,numeric,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_mpesa_transaction(
  p_transaction_id uuid,p_success boolean,p_result_code text,p_description text,p_receipt text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx public.mpesa_transactions%ROWTYPE; fx numeric; credit_usdt numeric;
BEGIN
  SELECT * INTO tx FROM public.mpesa_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND OR tx.status IN ('completed','failed') THEN RETURN false; END IF;
  IF p_success THEN
    UPDATE public.mpesa_transactions SET status='completed',result_code=p_result_code,
      result_description=p_description,mpesa_receipt_number=p_receipt,updated_at=now() WHERE id=tx.id;
    IF tx.kind='deposit' THEN
      IF tx.converted_usdt IS NULL OR tx.conversion_rate IS NULL THEN
        fx:=tx.conversion_rate;
        IF fx IS NULL OR fx<=0 THEN SELECT kes_per_usdt INTO fx FROM public.site_settings WHERE id=true; END IF;
        IF fx IS NULL OR fx<=0 THEN RAISE EXCEPTION 'M-Pesa exchange rate is unavailable'; END IF;
        credit_usdt:=round(tx.net_amount_kes/fx,8);
        UPDATE public.mpesa_transactions SET conversion_rate=fx,converted_usdt=credit_usdt WHERE id=tx.id;
      ELSE
        fx:=tx.conversion_rate;
        credit_usdt:=tx.converted_usdt;
      END IF;
      IF credit_usdt<=0 THEN RAISE EXCEPTION 'M-Pesa deposit is too small to convert into USDT'; END IF;
      INSERT INTO public.funding_wallets(user_id,asset,balance) VALUES(tx.user_id,'USDT',credit_usdt)
        ON CONFLICT(user_id,asset) DO UPDATE SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();
        INSERT INTO public.funding_transactions(user_id,method_name,kind,asset,amount,status,admin_note,reviewed_at,fee_amount,net_amount)
          VALUES(tx.user_id,'M-Pesa KES to USDT conversion','deposit','USDT',credit_usdt,'completed',
            'M-Pesa deposit of '||tx.amount_kes||' KES converted at '||fx||' KES per USDT; receipt '||coalesce(p_receipt,'not supplied')||'.',
            now(),0,credit_usdt);
    END IF;
  ELSE
    UPDATE public.mpesa_transactions SET status='failed',result_code=p_result_code,result_description=p_description,updated_at=now() WHERE id=tx.id;
    IF tx.kind='withdrawal' THEN
      IF tx.source_asset='USDT' AND tx.source_amount_usdt IS NOT NULL THEN
        INSERT INTO public.funding_wallets(user_id,asset,balance) VALUES(tx.user_id,'USDT',tx.source_amount_usdt)
          ON CONFLICT(user_id,asset) DO UPDATE SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();
      ELSE
        fx:=tx.conversion_rate;
        IF fx IS NULL OR fx<=0 THEN SELECT kes_per_usdt INTO fx FROM public.site_settings WHERE id=true; END IF;
        IF fx IS NULL OR fx<=0 THEN RAISE EXCEPTION 'M-Pesa exchange rate is unavailable'; END IF;
        credit_usdt:=round(tx.amount_kes/fx,8);
        INSERT INTO public.funding_wallets(user_id,asset,balance) VALUES(tx.user_id,'USDT',credit_usdt)
          ON CONFLICT(user_id,asset) DO UPDATE SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();
      END IF;
    END IF;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_mpesa_transaction(uuid,boolean,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_mpesa_transaction(uuid,boolean,text,text,text) TO service_role;

-- M-Pesa deposits also qualify accounts for live USDT trading, including
-- legacy accounts whose old KES wallet balance was already spent or withdrawn.
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
  IF p_entry_price<=0 OR p_entry_price_ts < (extract(epoch FROM clock_timestamp())*1000)::bigint-5000 OR p_entry_price_ts > (extract(epoch FROM clock_timestamp())*1000)::bigint+1000 THEN RAISE EXCEPTION 'The OKX market quote is stale; request a fresh quote'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.funding_transactions WHERE user_id=p_user_id AND asset='USDT' AND kind='deposit' AND status='completed'
    UNION ALL SELECT 1 FROM public.mpesa_transactions WHERE user_id=p_user_id AND kind='deposit' AND status='completed'
  ) THEN RAISE EXCEPTION 'Complete a confirmed deposit before trading'; END IF;
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
    VALUES('USDT',0,'profit_reserved',trade_id,'Payout reserve held for OKX market settlement',reserve_available,reserve_locked,stakes_locked);
  RETURN trade_id;
END $$;
REVOKE ALL ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_real_trade(uuid,text,text,text,numeric,smallint,numeric,bigint,uuid,boolean) TO service_role;
