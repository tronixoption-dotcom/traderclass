-- Reconcile the payout reserve to the verified company-owned balance.
-- Locked profit for open trades is protected and cannot be removed by this operation.
CREATE OR REPLACE FUNCTION public.set_real_trading_reserve_total(p_actor_id uuid,p_total numeric,p_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_available numeric; locked_profit numeric; locked_stakes numeric; next_available numeric; change_amount numeric;
BEGIN
  IF NOT public.has_role(p_actor_id,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_total<0 OR p_total>100000000 OR length(trim(coalesce(p_note,'')))<8 THEN RAISE EXCEPTION 'Enter a valid verified company balance and reconciliation note'; END IF;

  SELECT available,reserved_profit,reserved_stakes
    INTO current_available,locked_profit,locked_stakes
    FROM public.real_trading_reserves WHERE asset='USDT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USDT payout reserve is not initialized'; END IF;
  IF p_total<locked_profit THEN RAISE EXCEPTION 'Company balance cannot be lower than profit already committed to open trades'; END IF;

  next_available := round(p_total-locked_profit,8);
  change_amount := next_available-current_available;
  UPDATE public.real_trading_reserves SET available=next_available,updated_at=now() WHERE asset='USDT';
  INSERT INTO public.real_trading_reserve_ledger(asset,amount,kind,note,actor_id,available_after,reserved_profit_after,reserved_stakes_after)
    VALUES('USDT',change_amount,'admin_adjustment',left(trim(p_note),300),p_actor_id,next_available,locked_profit,locked_stakes);
  RETURN next_available;
END $$;
REVOKE ALL ON FUNCTION public.set_real_trading_reserve_total(uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_real_trading_reserve_total(uuid,numeric,text) TO service_role;
