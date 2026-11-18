ALTER TABLE public.real_trades
  ADD COLUMN IF NOT EXISTS market_source text NOT NULL DEFAULT 'inhouse'
  CHECK (market_source IN ('okx','inhouse'));

-- The preceding application version settled every new live contract from OKX.
UPDATE public.real_trades SET market_source='okx' WHERE status='open';

CREATE INDEX IF NOT EXISTS real_trades_open_source_idx
  ON public.real_trades(user_id, market_source, expires_at)
  WHERE status='open';
