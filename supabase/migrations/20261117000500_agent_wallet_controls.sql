CREATE TABLE public.client_wallet_controls (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_enabled boolean NOT NULL DEFAULT false,
  deposits_enabled boolean NOT NULL DEFAULT true,
  withdrawals_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_wallet_controls ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.client_wallet_controls TO authenticated;
CREATE POLICY "Clients read own wallet controls" ON public.client_wallet_controls FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Admins read wallet controls" ON public.client_wallet_controls FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.admin_set_client_wallet_control(p_user_id uuid,p_field text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'Client account not found'; END IF;
  INSERT INTO public.client_wallet_controls(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  IF p_field='agent_enabled' THEN
    UPDATE public.client_wallet_controls SET agent_enabled=p_enabled, updated_at=now() WHERE user_id=p_user_id;
  ELSIF p_field='deposits_enabled' THEN
    UPDATE public.client_wallet_controls SET deposits_enabled=p_enabled, updated_at=now() WHERE user_id=p_user_id;
  ELSIF p_field='withdrawals_enabled' THEN
    UPDATE public.client_wallet_controls SET withdrawals_enabled=p_enabled, updated_at=now() WHERE user_id=p_user_id;
  ELSE RAISE EXCEPTION 'Unknown wallet control'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_client_wallet_control(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_client_wallet_control(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_credit_client_wallet(p_user_id uuid, p_amount numeric, p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 OR round(p_amount,8) <> p_amount THEN RAISE EXCEPTION 'Enter a valid USDT amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_wallet_controls WHERE user_id=p_user_id AND agent_enabled) THEN RAISE EXCEPTION 'Elevate this client to Agent status before changing their balance'; END IF;
  INSERT INTO public.funding_wallets(user_id,asset,balance) VALUES(p_user_id,'USDT',p_amount)
    ON CONFLICT(user_id,asset) DO UPDATE SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();
  INSERT INTO public.funding_transactions(user_id,method_name,kind,asset,amount,status,admin_note,reviewed_by,reviewed_at)
    VALUES(p_user_id,'Admin wallet credit','deposit','USDT',p_amount,'completed',left(trim(coalesce(p_note,'')),500),auth.uid(),now());
END $$;
REVOKE ALL ON FUNCTION public.admin_credit_client_wallet(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_credit_client_wallet(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_debit_client_wallet(p_user_id uuid, p_amount numeric, p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 OR round(p_amount,8) <> p_amount THEN RAISE EXCEPTION 'Enter a valid USDT amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_wallet_controls WHERE user_id=p_user_id AND agent_enabled) THEN RAISE EXCEPTION 'Elevate this client to Agent status before changing their balance'; END IF;
  UPDATE public.funding_wallets SET balance=balance-p_amount,updated_at=now() WHERE user_id=p_user_id AND asset='USDT' AND balance>=p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient available USDT balance'; END IF;
  INSERT INTO public.funding_transactions(user_id,method_name,kind,asset,amount,status,admin_note,reviewed_by,reviewed_at)
    VALUES(p_user_id,'Admin wallet adjustment','withdrawal','USDT',p_amount,'completed',left(trim(coalesce(p_note,'')),500),auth.uid(),now());
END $$;
REVOKE ALL ON FUNCTION public.admin_debit_client_wallet(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_debit_client_wallet(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_funding_deposit(p_method_id uuid,p_amount numeric,p_reference text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.funding_methods%ROWTYPE; tx_id uuid; fee_rate numeric; fee numeric; net numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id=true AND deposits_enabled) THEN RAISE EXCEPTION 'Deposits are currently paused'; END IF;
  IF EXISTS (SELECT 1 FROM public.client_wallet_controls WHERE user_id=auth.uid() AND NOT deposits_enabled) THEN RAISE EXCEPTION 'Deposits are disabled for this account'; END IF;
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
  IF EXISTS (SELECT 1 FROM public.client_wallet_controls WHERE user_id=auth.uid() AND NOT withdrawals_enabled) THEN RAISE EXCEPTION 'Withdrawals are disabled for this account'; END IF;
  SELECT * INTO m FROM public.funding_methods WHERE id=p_method_id AND withdrawals_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This withdrawal method is unavailable'; END IF;
  IF round(p_amount,8)<>p_amount THEN RAISE EXCEPTION 'Amount supports up to 8 decimal places'; END IF;
  IF p_amount < m.min_amount OR p_amount > m.max_amount THEN RAISE EXCEPTION 'Amount is outside this method limits'; END IF;
  IF length(trim(coalesce(p_destination,''))) < 5 THEN RAISE EXCEPTION 'Enter a valid payout destination'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.funding_transactions WHERE user_id=auth.uid() AND kind='deposit' AND status='completed'
    UNION ALL SELECT 1 FROM public.mpesa_transactions WHERE user_id=auth.uid() AND kind='deposit' AND status='completed'
  ) THEN RAISE EXCEPTION 'Make one successful deposit to activate withdrawals'; END IF;
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
