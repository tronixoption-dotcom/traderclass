CREATE TABLE public.mpesa_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_kes bigint NOT NULL DEFAULT 0 CHECK (balance_kes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mpesa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('deposit','withdrawal')),
  status text NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
  amount_kes bigint NOT NULL CHECK (amount_kes > 0),
  phone_number text NOT NULL,
  checkout_request_id text UNIQUE,
  merchant_request_id text,
  conversation_id text,
  originator_conversation_id text,
  mpesa_receipt_number text,
  result_code text,
  result_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mpesa_transactions_user_created_idx ON public.mpesa_transactions(user_id, created_at DESC);
CREATE INDEX mpesa_transactions_withdrawal_processing_idx ON public.mpesa_transactions(user_id, status) WHERE kind='withdrawal';
CREATE INDEX mpesa_transactions_originator_idx ON public.mpesa_transactions(originator_conversation_id) WHERE originator_conversation_id IS NOT NULL;

ALTER TABLE public.mpesa_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mpesa_wallets, public.mpesa_transactions TO authenticated;
GRANT ALL ON public.mpesa_wallets, public.mpesa_transactions TO service_role;
CREATE POLICY "Users read own M-Pesa wallet" ON public.mpesa_wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users read own M-Pesa transactions" ON public.mpesa_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.request_mpesa_withdrawal(
  p_user_id uuid, p_amount_kes bigint, p_phone_number text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx_id uuid;
BEGIN
  IF p_amount_kes < 1 OR p_amount_kes > 150000 THEN RAISE EXCEPTION 'Invalid withdrawal amount'; END IF;
  INSERT INTO public.mpesa_wallets(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.mpesa_wallets SET balance_kes = balance_kes - p_amount_kes, updated_at = now()
    WHERE user_id = p_user_id AND balance_kes >= p_amount_kes;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient KES wallet balance'; END IF;
  INSERT INTO public.mpesa_transactions(user_id,kind,status,amount_kes,phone_number)
    VALUES (p_user_id,'withdrawal','processing',p_amount_kes,p_phone_number) RETURNING id INTO tx_id;
  RETURN tx_id;
END $$;
REVOKE ALL ON FUNCTION public.request_mpesa_withdrawal(uuid,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_mpesa_withdrawal(uuid,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_mpesa_transaction(
  p_transaction_id uuid, p_success boolean, p_result_code text, p_description text,
  p_receipt text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx public.mpesa_transactions%ROWTYPE;
BEGIN
  SELECT * INTO tx FROM public.mpesa_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND OR tx.status IN ('completed','failed') THEN RETURN false; END IF;
  IF p_success THEN
    UPDATE public.mpesa_transactions SET status='completed', result_code=p_result_code,
      result_description=p_description, mpesa_receipt_number=p_receipt, updated_at=now() WHERE id=tx.id;
    IF tx.kind='deposit' THEN
      INSERT INTO public.mpesa_wallets(user_id,balance_kes) VALUES (tx.user_id,tx.amount_kes)
      ON CONFLICT (user_id) DO UPDATE SET balance_kes=public.mpesa_wallets.balance_kes+EXCLUDED.balance_kes, updated_at=now();
    END IF;
  ELSE
    UPDATE public.mpesa_transactions SET status='failed', result_code=p_result_code,
      result_description=p_description, updated_at=now() WHERE id=tx.id;
    IF tx.kind='withdrawal' THEN
      UPDATE public.mpesa_wallets SET balance_kes=balance_kes+tx.amount_kes, updated_at=now() WHERE user_id=tx.user_id;
    END IF;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_mpesa_transaction(uuid,boolean,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_mpesa_transaction(uuid,boolean,text,text,text) TO service_role;
