ALTER TABLE public.site_settings
  ADD COLUMN real_daily_loss_cap numeric(20,8) NOT NULL DEFAULT 0 CHECK (real_daily_loss_cap >= 0),
  ADD COLUMN real_weekly_loss_cap numeric(20,8) NOT NULL DEFAULT 0 CHECK (real_weekly_loss_cap >= 0),
  ADD COLUMN real_monthly_loss_cap numeric(20,8) NOT NULL DEFAULT 0 CHECK (real_monthly_loss_cap >= 0),
  ADD COLUMN real_market_exposure_cap numeric(20,8) NOT NULL DEFAULT 0 CHECK (real_market_exposure_cap >= 0),
  ADD COLUMN real_user_exposure_cap numeric(20,8) NOT NULL DEFAULT 0 CHECK (real_user_exposure_cap >= 0),
  ADD COLUMN fraud_detection_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN fraud_max_trades_per_minute smallint NOT NULL DEFAULT 10 CHECK (fraud_max_trades_per_minute BETWEEN 1 AND 60);

UPDATE public.funding_methods
  SET asset='USDT', min_amount=greatest(min_amount,10), max_amount=greatest(max_amount,10)
  WHERE provider='crypto';
ALTER TABLE public.funding_methods
  ADD CONSTRAINT funding_methods_crypto_usdt_minimum
  CHECK (provider <> 'crypto' OR (asset='USDT' AND min_amount>=10));

CREATE OR REPLACE FUNCTION public.enforce_real_trade_risk_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.site_settings%ROWTYPE; open_market numeric; open_user numeric; recent_orders integer;
  daily_loss numeric; weekly_loss numeric; monthly_loss numeric;
BEGIN
  SELECT * INTO cfg FROM public.site_settings WHERE id=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trading risk settings are unavailable'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('real-market:' || NEW.inst_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('real-user:' || NEW.user_id::text,0));

  SELECT coalesce(sum(stake),0) INTO open_market FROM public.real_trades
    WHERE status='open' AND inst_id=NEW.inst_id;
  SELECT coalesce(sum(stake),0) INTO open_user FROM public.real_trades
    WHERE status='open' AND user_id=NEW.user_id;
  IF cfg.real_market_exposure_cap>0 AND open_market+NEW.stake>cfg.real_market_exposure_cap THEN
    RAISE EXCEPTION 'Market exposure limit reached';
  END IF;
  IF cfg.real_user_exposure_cap>0 AND open_user+NEW.stake>cfg.real_user_exposure_cap THEN
    RAISE EXCEPTION 'Your open trade exposure limit has been reached';
  END IF;

  SELECT coalesce(sum(stake-coalesce(payout,0)),0) INTO daily_loss FROM public.real_trades
    WHERE user_id=NEW.user_id AND status<>'open' AND settled_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT coalesce(sum(stake-coalesce(payout,0)),0) INTO weekly_loss FROM public.real_trades
    WHERE user_id=NEW.user_id AND status<>'open' AND settled_at >= date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT coalesce(sum(stake-coalesce(payout,0)),0) INTO monthly_loss FROM public.real_trades
    WHERE user_id=NEW.user_id AND status<>'open' AND settled_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF cfg.real_daily_loss_cap>0 AND greatest(0,daily_loss)+open_user+NEW.stake>cfg.real_daily_loss_cap THEN
    RAISE EXCEPTION 'Daily loss limit reached';
  END IF;
  IF cfg.real_weekly_loss_cap>0 AND greatest(0,weekly_loss)+open_user+NEW.stake>cfg.real_weekly_loss_cap THEN
    RAISE EXCEPTION 'Weekly loss limit reached';
  END IF;
  IF cfg.real_monthly_loss_cap>0 AND greatest(0,monthly_loss)+open_user+NEW.stake>cfg.real_monthly_loss_cap THEN
    RAISE EXCEPTION 'Monthly loss limit reached';
  END IF;

  IF cfg.fraud_detection_enabled THEN
    SELECT count(*) INTO recent_orders FROM public.real_trades
      WHERE user_id=NEW.user_id AND created_at >= now()-interval '1 minute';
    IF recent_orders >= cfg.fraud_max_trades_per_minute THEN
      RAISE EXCEPTION 'Automated risk check: too many trades in a short period';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER enforce_real_trade_risk_limits
  BEFORE INSERT ON public.real_trades
  FOR EACH ROW EXECUTE FUNCTION public.enforce_real_trade_risk_limits();

REVOKE ALL ON FUNCTION public.enforce_real_trade_risk_limits() FROM PUBLIC,anon,authenticated;
