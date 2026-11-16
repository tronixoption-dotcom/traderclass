ALTER TABLE public.site_settings
  ADD COLUMN deposit_fee_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (deposit_fee_percent BETWEEN 0 AND 20),
  ADD COLUMN withdrawal_fee_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (withdrawal_fee_percent BETWEEN 0 AND 20);

ALTER TABLE public.funding_transactions
  ADD COLUMN fee_amount numeric(20,8) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  ADD COLUMN net_amount numeric(20,8) NOT NULL DEFAULT 0 CHECK (net_amount >= 0);
UPDATE public.funding_transactions SET net_amount=amount;

ALTER TABLE public.mpesa_transactions
  ADD COLUMN fee_amount_kes bigint NOT NULL DEFAULT 0 CHECK (fee_amount_kes >= 0),
  ADD COLUMN net_amount_kes bigint NOT NULL DEFAULT 0 CHECK (net_amount_kes >= 0);
UPDATE public.mpesa_transactions SET net_amount_kes=amount_kes;

CREATE OR REPLACE FUNCTION public.request_funding_deposit(p_method_id uuid,p_amount numeric,p_reference text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.funding_methods%ROWTYPE; tx_id uuid; fee_rate numeric; fee numeric; net numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id=true AND deposits_enabled) THEN RAISE EXCEPTION 'Deposits are currently paused'; END IF;
  SELECT * INTO m FROM public.funding_methods WHERE id=p_method_id AND deposits_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This deposit method is unavailable'; END IF;
  IF round(p_amount,8)<>p_amount THEN RAISE EXCEPTION 'Amount supports up to 8 decimal places'; END IF;
  IF p_amount < m.min_amount OR p_amount > m.max_amount THEN RAISE EXCEPTION 'Amount is outside this method limits'; END IF;
  IF m.provider='crypto' AND length(trim(coalesce(p_reference,''))) < 8 THEN RAISE EXCEPTION 'Enter the transaction hash after sending the transfer'; END IF;
  SELECT coalesce(deposit_fee_percent,0) INTO fee_rate FROM public.site_settings WHERE id=true;
  fee:=round(p_amount*coalesce(fee_rate,0)/100,8); net:=p_amount-fee;
  IF net<=0 THEN RAISE EXCEPTION 'Deposit amount must be greater than its fee'; END IF;
  INSERT INTO public.funding_transactions(user_id,method_id,method_name,kind,asset,amount,status,user_reference,fee_amount,net_amount)
  VALUES(auth.uid(),m.id,m.name,'deposit',m.asset,p_amount,'under_review',left(trim(coalesce(p_reference,'')),180),fee,net) RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;

CREATE OR REPLACE FUNCTION public.request_funding_withdrawal(p_method_id uuid,p_amount numeric,p_destination text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.funding_methods%ROWTYPE; tx_id uuid; fee_rate numeric; fee numeric; net numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id=true AND withdrawals_enabled) THEN RAISE EXCEPTION 'Withdrawals are currently paused'; END IF;
  SELECT * INTO m FROM public.funding_methods WHERE id=p_method_id AND withdrawals_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This withdrawal method is unavailable'; END IF;
  IF round(p_amount,8)<>p_amount THEN RAISE EXCEPTION 'Amount supports up to 8 decimal places'; END IF;
  IF p_amount < m.min_amount OR p_amount > m.max_amount THEN RAISE EXCEPTION 'Amount is outside this method limits'; END IF;
  IF length(trim(coalesce(p_destination,''))) < 5 THEN RAISE EXCEPTION 'Enter a valid payout destination'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.funding_transactions WHERE user_id=auth.uid() AND kind='deposit' AND status='completed'
    UNION ALL SELECT 1 FROM public.mpesa_transactions WHERE user_id=auth.uid() AND kind='deposit' AND status='completed')
  THEN RAISE EXCEPTION 'Make one successful deposit to activate withdrawals'; END IF;
  SELECT coalesce(withdrawal_fee_percent,0) INTO fee_rate FROM public.site_settings WHERE id=true;
  fee:=round(p_amount*coalesce(fee_rate,0)/100,8); net:=p_amount-fee;
  IF net<=0 THEN RAISE EXCEPTION 'Withdrawal amount must be greater than its fee'; END IF;
  INSERT INTO public.funding_wallets(user_id,asset) VALUES(auth.uid(),m.asset) ON CONFLICT DO NOTHING;
  UPDATE public.funding_wallets SET balance=balance-p_amount,updated_at=now() WHERE user_id=auth.uid() AND asset=m.asset AND balance>=p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  INSERT INTO public.funding_transactions(user_id,method_id,method_name,kind,asset,amount,status,destination,fee_amount,net_amount)
  VALUES(auth.uid(),m.id,m.name,'withdrawal',m.asset,p_amount,'processing',left(trim(p_destination),180),fee,net) RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_funding_transaction(p_transaction_id uuid,p_approve boolean,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx public.funding_transactions%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO tx FROM public.funding_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF tx.status NOT IN ('under_review','processing') THEN RAISE EXCEPTION 'Transaction has already been reviewed'; END IF;
  IF tx.kind='deposit' AND p_approve THEN
    INSERT INTO public.funding_wallets(user_id,asset,balance) VALUES(tx.user_id,tx.asset,tx.net_amount)
    ON CONFLICT(user_id,asset) DO UPDATE SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();
  ELSIF tx.kind='withdrawal' AND NOT p_approve THEN
    UPDATE public.funding_wallets SET balance=balance+tx.amount,updated_at=now() WHERE user_id=tx.user_id AND asset=tx.asset;
  END IF;
  UPDATE public.funding_transactions SET status=CASE WHEN p_approve THEN 'completed' ELSE 'rejected' END,
    admin_note=left(trim(coalesce(p_note,'')),500),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=tx.id;
END $$;

CREATE OR REPLACE FUNCTION public.request_mpesa_withdrawal(p_user_id uuid,p_amount_kes bigint,p_phone_number text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx_id uuid; fee_rate numeric; fee_kes bigint; net_kes bigint;
BEGIN
  IF p_amount_kes<1 OR p_amount_kes>150000 THEN RAISE EXCEPTION 'Invalid withdrawal amount'; END IF;
  SELECT coalesce(withdrawal_fee_percent,0) INTO fee_rate FROM public.site_settings WHERE id=true;
  fee_kes:=round(p_amount_kes*coalesce(fee_rate,0)/100); net_kes:=p_amount_kes-fee_kes;
  IF net_kes<1 THEN RAISE EXCEPTION 'Withdrawal amount must be greater than its fee'; END IF;
  INSERT INTO public.mpesa_wallets(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
  UPDATE public.mpesa_wallets SET balance_kes=balance_kes-p_amount_kes,updated_at=now() WHERE user_id=p_user_id AND balance_kes>=p_amount_kes;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient KES wallet balance'; END IF;
  INSERT INTO public.mpesa_transactions(user_id,kind,status,amount_kes,phone_number,fee_amount_kes,net_amount_kes)
    VALUES(p_user_id,'withdrawal','processing',p_amount_kes,p_phone_number,fee_kes,net_kes) RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;
REVOKE ALL ON FUNCTION public.request_mpesa_withdrawal(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_mpesa_withdrawal(uuid,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_mpesa_transaction(p_transaction_id uuid,p_success boolean,p_result_code text,p_description text,p_receipt text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx public.mpesa_transactions%ROWTYPE;
BEGIN
  SELECT * INTO tx FROM public.mpesa_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND OR tx.status IN ('completed','failed') THEN RETURN false; END IF;
  IF p_success THEN
    UPDATE public.mpesa_transactions SET status='completed',result_code=p_result_code,result_description=p_description,mpesa_receipt_number=p_receipt,updated_at=now() WHERE id=tx.id;
    IF tx.kind='deposit' THEN
      INSERT INTO public.mpesa_wallets(user_id,balance_kes) VALUES(tx.user_id,tx.net_amount_kes)
      ON CONFLICT(user_id) DO UPDATE SET balance_kes=public.mpesa_wallets.balance_kes+EXCLUDED.balance_kes,updated_at=now();
    END IF;
  ELSE
    UPDATE public.mpesa_transactions SET status='failed',result_code=p_result_code,result_description=p_description,updated_at=now() WHERE id=tx.id;
    IF tx.kind='withdrawal' THEN UPDATE public.mpesa_wallets SET balance_kes=balance_kes+tx.amount_kes,updated_at=now() WHERE user_id=tx.user_id; END IF;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_mpesa_transaction(uuid,boolean,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_mpesa_transaction(uuid,boolean,text,text,text) TO service_role;
