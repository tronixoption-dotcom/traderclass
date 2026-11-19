ALTER TABLE public.site_settings
  ADD COLUMN minimum_deposit_usdt numeric(20,8) NOT NULL DEFAULT 10 CHECK (minimum_deposit_usdt BETWEEN 10 AND 1000000),
  ADD COLUMN minimum_withdrawal_usdt numeric(20,8) NOT NULL DEFAULT 1 CHECK (minimum_withdrawal_usdt BETWEEN 0.00000001 AND 1000000);

CREATE OR REPLACE FUNCTION public.request_funding_deposit(p_method_id uuid,p_amount numeric,p_reference text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.funding_methods%ROWTYPE; tx_id uuid; fee_rate numeric; fee numeric; net numeric; global_min numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id=true AND deposits_enabled) THEN RAISE EXCEPTION 'Deposits are currently paused'; END IF;
  IF EXISTS (SELECT 1 FROM public.client_wallet_controls WHERE user_id=auth.uid() AND NOT deposits_enabled) THEN RAISE EXCEPTION 'Deposits are disabled for this account'; END IF;
  SELECT * INTO m FROM public.funding_methods WHERE id=p_method_id AND deposits_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This deposit method is unavailable'; END IF;
  IF round(p_amount,8)<>p_amount THEN RAISE EXCEPTION 'Amount supports up to 8 decimal places'; END IF;
  SELECT minimum_deposit_usdt,coalesce(deposit_fee_percent,0) INTO global_min,fee_rate FROM public.site_settings WHERE id=true;
  IF p_amount < greatest(m.min_amount,CASE WHEN m.asset='USDT' THEN global_min ELSE m.min_amount END) OR p_amount > m.max_amount THEN
    RAISE EXCEPTION 'Deposit is below the minimum of % % or above this method limit',greatest(m.min_amount,CASE WHEN m.asset='USDT' THEN global_min ELSE m.min_amount END),m.asset;
  END IF;
  IF m.provider='crypto' AND length(trim(coalesce(p_reference,''))) < 8 THEN RAISE EXCEPTION 'Enter the transaction hash after sending the transfer'; END IF;
  fee:=round(p_amount*coalesce(fee_rate,0)/100,8); net:=p_amount-fee;
  IF net<=0 THEN RAISE EXCEPTION 'Deposit amount must be greater than its fee'; END IF;
  INSERT INTO public.funding_transactions(user_id,method_id,method_name,kind,asset,amount,status,user_reference,fee_amount,net_amount)
  VALUES(auth.uid(),m.id,m.name,'deposit',m.asset,p_amount,'under_review',left(trim(coalesce(p_reference,'')),180),fee,net) RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;

CREATE OR REPLACE FUNCTION public.request_funding_withdrawal(p_method_id uuid,p_amount numeric,p_destination text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.funding_methods%ROWTYPE; tx_id uuid; fee_rate numeric; fee numeric; net numeric; global_min numeric; minimum_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id=true AND withdrawals_enabled) THEN RAISE EXCEPTION 'Withdrawals are currently paused'; END IF;
  IF EXISTS (SELECT 1 FROM public.client_wallet_controls WHERE user_id=auth.uid() AND NOT withdrawals_enabled) THEN RAISE EXCEPTION 'Withdrawals are disabled for this account'; END IF;
  SELECT * INTO m FROM public.funding_methods WHERE id=p_method_id AND withdrawals_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This withdrawal method is unavailable'; END IF;
  IF round(p_amount,8)<>p_amount THEN RAISE EXCEPTION 'Amount supports up to 8 decimal places'; END IF;
  SELECT minimum_withdrawal_usdt,coalesce(withdrawal_fee_percent,0) INTO global_min,fee_rate FROM public.site_settings WHERE id=true;
  minimum_amount:=CASE WHEN m.asset='USDT' THEN global_min ELSE m.min_amount END;
  IF p_amount < minimum_amount OR p_amount > m.max_amount THEN
    RAISE EXCEPTION 'Withdrawal is below the minimum of % % or above this method limit',minimum_amount,m.asset;
  END IF;
  IF length(trim(coalesce(p_destination,''))) < 5 THEN RAISE EXCEPTION 'Enter a valid payout destination'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.funding_transactions WHERE user_id=auth.uid() AND kind='deposit' AND status='completed'
    UNION ALL SELECT 1 FROM public.mpesa_transactions WHERE user_id=auth.uid() AND kind='deposit' AND status='completed')
  THEN RAISE EXCEPTION 'Make one successful deposit to activate withdrawals'; END IF;
  fee:=round(p_amount*coalesce(fee_rate,0)/100,8); net:=p_amount-fee;
  IF net<=0 THEN RAISE EXCEPTION 'Withdrawal amount must be greater than its fee'; END IF;
  INSERT INTO public.funding_wallets(user_id,asset) VALUES(auth.uid(),m.asset) ON CONFLICT DO NOTHING;
  UPDATE public.funding_wallets SET balance=balance-p_amount,updated_at=now() WHERE user_id=auth.uid() AND asset=m.asset AND balance>=p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  INSERT INTO public.funding_transactions(user_id,method_id,method_name,kind,asset,amount,status,destination,fee_amount,net_amount)
  VALUES(auth.uid(),m.id,m.name,'withdrawal',m.asset,p_amount,'processing',left(trim(p_destination),180),fee,net) RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;
