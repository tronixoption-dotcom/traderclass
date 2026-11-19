CREATE OR REPLACE FUNCTION public.admin_review_mpesa_transaction(
  p_transaction_id uuid,
  p_approve boolean,
  p_note text DEFAULT '',
  p_receipt text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tx public.mpesa_transactions%ROWTYPE;
  fx numeric;
  credit_usdt numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT * INTO tx FROM public.mpesa_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'M-Pesa transaction not found'; END IF;
  IF tx.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'Only M-Pesa transactions without a final provider result can be reviewed';
  END IF;

  IF tx.kind = 'deposit' AND p_approve THEN
    fx := tx.conversion_rate;
    IF fx IS NULL OR fx <= 0 THEN SELECT kes_per_usdt INTO fx FROM public.site_settings WHERE id = true; END IF;
    IF fx IS NULL OR fx <= 0 THEN RAISE EXCEPTION 'M-Pesa exchange rate is unavailable'; END IF;
    credit_usdt := coalesce(tx.converted_usdt, round(tx.net_amount_kes / fx, 8));
    IF credit_usdt <= 0 THEN RAISE EXCEPTION 'M-Pesa deposit is too small to convert into USDT'; END IF;

    UPDATE public.mpesa_transactions SET status = 'completed', result_code = 'MANUAL_VERIFIED',
      result_description = coalesce(nullif(trim(p_note), ''), 'Manually verified by an administrator'),
      mpesa_receipt_number = coalesce(nullif(trim(p_receipt), ''), tx.mpesa_receipt_number),
      conversion_rate = fx, converted_usdt = credit_usdt, updated_at = now()
      WHERE id = tx.id;
    INSERT INTO public.funding_wallets(user_id, asset, balance) VALUES (tx.user_id, 'USDT', credit_usdt)
      ON CONFLICT(user_id, asset) DO UPDATE
      SET balance = public.funding_wallets.balance + EXCLUDED.balance, updated_at = now();
    INSERT INTO public.funding_transactions(user_id, method_name, kind, asset, amount, status, admin_note,
      reviewed_at, fee_amount, net_amount)
      VALUES (tx.user_id, 'M-Pesa KES to USDT conversion', 'deposit', 'USDT', credit_usdt, 'completed',
        'Manually verified M-Pesa deposit of ' || tx.amount_kes || ' KES converted at ' || fx || ' KES per USDT.',
        now(), 0, credit_usdt);
  ELSIF tx.kind = 'deposit' THEN
    UPDATE public.mpesa_transactions SET status = 'failed', result_code = 'MANUAL_REJECTED',
      result_description = coalesce(nullif(trim(p_note), ''), 'Rejected after manual review'), updated_at = now()
      WHERE id = tx.id;
  ELSIF p_approve THEN
    UPDATE public.mpesa_transactions SET status = 'completed', result_code = 'MANUAL_CONFIRMED',
      result_description = coalesce(nullif(trim(p_note), ''), 'Payout manually confirmed by an administrator'), updated_at = now()
      WHERE id = tx.id;
  ELSE
    UPDATE public.mpesa_transactions SET status = 'failed', result_code = 'MANUAL_REJECTED',
      result_description = coalesce(nullif(trim(p_note), ''), 'Payout rejected after manual review'), updated_at = now()
      WHERE id = tx.id;
    IF tx.source_asset = 'USDT' AND tx.source_amount_usdt IS NOT NULL THEN
      credit_usdt := tx.source_amount_usdt;
    ELSE
      fx := tx.conversion_rate;
      IF fx IS NULL OR fx <= 0 THEN SELECT kes_per_usdt INTO fx FROM public.site_settings WHERE id = true; END IF;
      IF fx IS NULL OR fx <= 0 THEN RAISE EXCEPTION 'M-Pesa exchange rate is unavailable'; END IF;
      credit_usdt := round(tx.amount_kes / fx, 8);
    END IF;
    INSERT INTO public.funding_wallets(user_id, asset, balance) VALUES (tx.user_id, 'USDT', credit_usdt)
      ON CONFLICT(user_id, asset) DO UPDATE
      SET balance = public.funding_wallets.balance + EXCLUDED.balance, updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_mpesa_transaction(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_mpesa_transaction(uuid, boolean, text, text) TO authenticated;
