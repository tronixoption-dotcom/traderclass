-- Settlement prices are fetched and freshness-checked by the service-role
-- server function. Do not compare its clock/timestamp with the database clock:
-- small clock skew previously left expired trades open forever.
CREATE OR REPLACE FUNCTION public.settle_real_trade(p_trade_id uuid,p_close_price numeric,p_close_candle_ts bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx public.real_trades%ROWTYPE; won boolean; result text; amount numeric; reserve_available numeric; reserve_locked numeric; stakes_locked numeric;
BEGIN
  SELECT * INTO tx FROM public.real_trades WHERE id=p_trade_id FOR UPDATE;
  IF NOT FOUND OR tx.status<>'open' THEN RETURN 'already_settled'; END IF;
  IF tx.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'Trade has not expired'; END IF;
  IF p_close_price<=0 OR p_close_candle_ts<=0 THEN RAISE EXCEPTION 'Invalid settlement quote'; END IF;

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
