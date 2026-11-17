CREATE OR REPLACE FUNCTION public.admin_credit_client_wallet(p_user_id uuid, p_amount numeric, p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 OR round(p_amount,8) <> p_amount THEN RAISE EXCEPTION 'Enter a valid USDT amount'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'Client account not found'; END IF;
  INSERT INTO public.funding_wallets(user_id,asset,balance) VALUES(p_user_id,'USDT',p_amount)
    ON CONFLICT(user_id,asset) DO UPDATE SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();
  INSERT INTO public.funding_transactions(user_id,method_name,kind,asset,amount,status,admin_note,reviewed_by,reviewed_at)
    VALUES(p_user_id,'Admin wallet credit','deposit','USDT',p_amount,'completed',left(trim(coalesce(p_note,'')),500),auth.uid(),now());
END $$;
REVOKE ALL ON FUNCTION public.admin_credit_client_wallet(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_credit_client_wallet(uuid,numeric,text) TO authenticated;
