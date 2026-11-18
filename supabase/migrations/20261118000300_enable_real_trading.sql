-- Enable the live USDT contract gate requested by the site owner.
-- open_real_trade continues to enforce customer deposits, wallet balance,
-- configured limits, and the separately funded payout reserve.
UPDATE public.site_settings
SET real_trading_enabled = true,
    updated_at = now()
WHERE id = true;
