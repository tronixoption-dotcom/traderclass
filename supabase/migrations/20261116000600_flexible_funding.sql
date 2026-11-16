CREATE TABLE public.funding_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{2,32}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 48),
  provider text NOT NULL CHECK (provider IN ('crypto','manual')),
  asset text NOT NULL CHECK (asset IN ('KES','USD','USDT')),
  network text NOT NULL DEFAULT '',
  deposit_address text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  min_amount numeric(20,8) NOT NULL DEFAULT 1 CHECK (min_amount > 0),
  max_amount numeric(20,8) NOT NULL DEFAULT 1000000 CHECK (max_amount >= min_amount),
  deposits_enabled boolean NOT NULL DEFAULT true,
  withdrawals_enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider <> 'crypto' OR (asset IN ('USD','USDT') AND length(trim(network)) > 0 AND length(trim(deposit_address)) > 0))
);

CREATE TABLE public.funding_wallets (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset text NOT NULL CHECK (asset IN ('KES','USD','USDT')),
  balance numeric(20,8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, asset)
);

CREATE TABLE public.funding_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method_id uuid REFERENCES public.funding_methods(id) ON DELETE SET NULL,
  method_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deposit','withdrawal')),
  asset text NOT NULL CHECK (asset IN ('KES','USD','USDT')),
  amount numeric(20,8) NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('under_review','processing','completed','rejected')),
  user_reference text NOT NULL DEFAULT '',
  destination text NOT NULL DEFAULT '',
  admin_note text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX funding_transactions_user_created_idx ON public.funding_transactions(user_id,created_at DESC);
CREATE INDEX funding_transactions_review_idx ON public.funding_transactions(status,created_at) WHERE status IN ('under_review','processing');
CREATE UNIQUE INDEX funding_transactions_unique_deposit_reference ON public.funding_transactions(lower(user_reference)) WHERE kind='deposit' AND user_reference<>'';

ALTER TABLE public.funding_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.funding_methods TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.funding_methods TO authenticated;
GRANT SELECT ON public.funding_wallets,public.funding_transactions TO authenticated;
GRANT ALL ON public.funding_methods,public.funding_wallets,public.funding_transactions TO service_role;
CREATE POLICY "Read enabled funding methods" ON public.funding_methods FOR SELECT TO authenticated USING ((deposits_enabled OR withdrawals_enabled) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage funding methods" ON public.funding_methods FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users read own funding wallets" ON public.funding_wallets FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Admins read funding wallets" ON public.funding_wallets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users read own funding transactions" ON public.funding_transactions FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Staff read funding transactions" ON public.funding_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'agent'));

CREATE OR REPLACE FUNCTION public.request_funding_deposit(p_method_id uuid,p_amount numeric,p_reference text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.funding_methods%ROWTYPE; tx_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id=true AND deposits_enabled) THEN RAISE EXCEPTION 'Deposits are currently paused'; END IF;
  SELECT * INTO m FROM public.funding_methods WHERE id=p_method_id AND deposits_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This deposit method is unavailable'; END IF;
  IF round(p_amount,8)<>p_amount THEN RAISE EXCEPTION 'Amount supports up to 8 decimal places'; END IF;
  IF p_amount < m.min_amount OR p_amount > m.max_amount THEN RAISE EXCEPTION 'Amount is outside this method limits'; END IF;
  IF m.provider='crypto' AND length(trim(coalesce(p_reference,''))) < 8 THEN RAISE EXCEPTION 'Enter the transaction hash after sending the transfer'; END IF;
  INSERT INTO public.funding_transactions(user_id,method_id,method_name,kind,asset,amount,status,user_reference)
  VALUES(auth.uid(),m.id,m.name,'deposit',m.asset,p_amount,'under_review',left(trim(coalesce(p_reference,'')),180)) RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;
REVOKE ALL ON FUNCTION public.request_funding_deposit(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_funding_deposit(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_funding_withdrawal(p_method_id uuid,p_amount numeric,p_destination text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.funding_methods%ROWTYPE; tx_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id=true AND withdrawals_enabled) THEN RAISE EXCEPTION 'Withdrawals are currently paused'; END IF;
  SELECT * INTO m FROM public.funding_methods WHERE id=p_method_id AND withdrawals_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This withdrawal method is unavailable'; END IF;
  IF round(p_amount,8)<>p_amount THEN RAISE EXCEPTION 'Amount supports up to 8 decimal places'; END IF;
  IF p_amount < m.min_amount OR p_amount > m.max_amount THEN RAISE EXCEPTION 'Amount is outside this method limits'; END IF;
  IF length(trim(coalesce(p_destination,''))) < 5 THEN RAISE EXCEPTION 'Enter a valid payout destination'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.funding_transactions WHERE user_id=auth.uid() AND kind='deposit' AND status='completed'
    UNION ALL
    SELECT 1 FROM public.mpesa_transactions WHERE user_id=auth.uid() AND kind='deposit' AND status='completed'
  ) THEN RAISE EXCEPTION 'Make one successful deposit to activate withdrawals'; END IF;
  INSERT INTO public.funding_wallets(user_id,asset) VALUES(auth.uid(),m.asset) ON CONFLICT DO NOTHING;
  UPDATE public.funding_wallets SET balance=balance-p_amount,updated_at=now()
  WHERE user_id=auth.uid() AND asset=m.asset AND balance>=p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  INSERT INTO public.funding_transactions(user_id,method_id,method_name,kind,asset,amount,status,destination)
  VALUES(auth.uid(),m.id,m.name,'withdrawal',m.asset,p_amount,'processing',left(trim(p_destination),180)) RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;
REVOKE ALL ON FUNCTION public.request_funding_withdrawal(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_funding_withdrawal(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_funding_transaction(p_transaction_id uuid,p_approve boolean,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx public.funding_transactions%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO tx FROM public.funding_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF tx.status NOT IN ('under_review','processing') THEN RAISE EXCEPTION 'Transaction has already been reviewed'; END IF;
  IF tx.kind='deposit' AND p_approve THEN
    INSERT INTO public.funding_wallets(user_id,asset,balance) VALUES(tx.user_id,tx.asset,tx.amount)
    ON CONFLICT(user_id,asset) DO UPDATE SET balance=public.funding_wallets.balance+EXCLUDED.balance,updated_at=now();
  ELSIF tx.kind='withdrawal' AND NOT p_approve THEN
    UPDATE public.funding_wallets SET balance=balance+tx.amount,updated_at=now() WHERE user_id=tx.user_id AND asset=tx.asset;
  END IF;
  UPDATE public.funding_transactions SET status=CASE WHEN p_approve THEN 'completed' ELSE 'rejected' END,
    admin_note=left(trim(coalesce(p_note,'')),500),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  WHERE id=tx.id;
END $$;
REVOKE ALL ON FUNCTION public.review_funding_transaction(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_funding_transaction(uuid,boolean,text) TO authenticated;
