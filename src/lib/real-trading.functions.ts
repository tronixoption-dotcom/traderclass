import { createClient } from '@supabase/supabase-js';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';
import { requireStaff } from './admin-session.server';
import { SYMBOLS } from './symbols';

function serviceDatabase() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SUPABASE_SECRET_ROLE_KEY'];
  if (!url || !key) throw new Error('Real trading backend is not configured');
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const tradeInput = z.object({
  requestId: z.string().uuid(), symbol: z.string().max(16), direction: z.enum(['buy', 'sell']),
  stake: z.number().positive(), duration: z.number().int(), byRobot: z.boolean().optional().default(false),
});

function marketSpec(symbol: string) {
  const spec = SYMBOLS.find((item) => item.id === symbol);
  if (!spec) throw new Error('Choose a listed market');
  return spec;
}

function okxInstrument(symbol: string) {
  const spec = marketSpec(symbol);
  if (spec.category !== 'Crypto' || !symbol.endsWith('USD')) throw new Error('OKX live prices are available for crypto markets only');
  return `${symbol.slice(0, -3)}-USDT`;
}

async function okxQuote(symbol: string) {
  const instId = okxInstrument(symbol);
  const response = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw new Error(`OKX market request failed (${response.status})`);
  const payload = await response.json() as { code?: string; msg?: string; data?: Array<{ last: string; bidPx: string; askPx: string; ts: string }> };
  const row = payload.data?.[0];
  const price = Number(row?.last);
  const timestamp = Number(row?.ts);
  if (payload.code !== '0' || !row || !Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp > Date.now() + 1000 || Date.now() - timestamp > 5000) {
    throw new Error(payload.msg || `No fresh OKX spot market for ${instId}`);
  }
  return { price, bid: Number(row.bidPx) || price, ask: Number(row.askPx) || price, timestamp, candleTs: timestamp, instId };
}

async function inhouseQuote(db: ReturnType<typeof serviceDatabase>, symbol: string) {
  const quote = await okxQuote(symbol);
  const { error } = await db.from('inhouse_market_ticks').upsert({ symbol, tick_at: new Date(quote.timestamp).toISOString(), price: quote.price });
  if (error) throw new Error('Could not save the OKX settlement quote');
  return quote;
}

export const getInhouseMarketQuote = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ symbol: z.string().max(16) }).parse(value)).handler(async ({ data }) => {
  const db = serviceDatabase();
  const quote = await inhouseQuote(db, data.symbol);
  return quote;
});

export const getInhouseMarketHistory = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ symbol: z.string().max(16), limit: z.number().int().min(10).max(3600), timeframe: z.number().int().optional() }).parse(value)).handler(async ({ data }) => {
  const instId = okxInstrument(data.symbol);
  const bar = data.timeframe && data.timeframe >= 86400 ? '1D' : data.timeframe && data.timeframe >= 14400 ? '4H' : data.timeframe && data.timeframe >= 3600 ? '1H' : data.timeframe && data.timeframe >= 1800 ? '30m' : data.timeframe && data.timeframe >= 900 ? '15m' : data.timeframe && data.timeframe >= 300 ? '5m' : '1m';
  const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${Math.min(data.limit, 300)}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load OKX market history');
  const payload = await response.json() as { code?: string; data?: string[][] };
  if (payload.code !== '0' || !payload.data?.length) throw new Error('OKX market history is unavailable');
  return payload.data.slice().reverse().map((row) => ({ time: Math.floor(Number(row[0]) / 1000), price: Number(row[4]) }));
});

export const getRealTradingData = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [wallet, trades, settings] = await Promise.all([
    context.supabase.from('funding_wallets').select('balance').eq('user_id', context.userId).eq('asset', 'USDT').maybeSingle(),
    context.supabase.from('real_trades').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(100),
    context.supabase.from('site_settings').select('real_trading_enabled,real_min_stake,real_max_stake').eq('id', true).maybeSingle(),
  ]);
  if (wallet.error || trades.error || settings.error) throw new Error('Could not load the real account');
  return { balance: Number(wallet.data?.balance ?? 0), trades: trades.data ?? [], settings: { enabled: settings.data?.real_trading_enabled ?? false, minStake: Number(settings.data?.real_min_stake ?? 1), maxStake: Number(settings.data?.real_max_stake ?? 0) } };
});

export const placeRealTrade = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => tradeInput.parse(value)).handler(async ({ data, context }) => {
  if (![5, 10, 15, 30, 60, 120, 300].includes(data.duration)) throw new Error('Choose a supported trade duration');
  const db = serviceDatabase();
  const quote = await inhouseQuote(db, data.symbol);
  const { data: tradeId, error } = await db.rpc('open_real_trade', {
    p_user_id: context.userId, p_symbol: data.symbol, p_inst_id: data.symbol, p_direction: data.direction,
    p_stake: data.stake, p_duration_seconds: data.duration, p_entry_price: quote.price,
    p_entry_price_ts: quote.timestamp, p_request_id: data.requestId, p_by_robot: data.byRobot,
  });
  if (error || !tradeId) throw new Error(error?.message || 'Could not open the real trade');
  const { data: trade, error: tradeError } = await db.from('real_trades').select('*').eq('id', tradeId).eq('user_id', context.userId).single();
  if (tradeError || !trade) throw new Error('Trade was opened but could not be loaded');
  const { data: wallet } = await db.from('funding_wallets').select('balance').eq('user_id', context.userId).eq('asset', 'USDT').maybeSingle();
  return { trade, balance: Number(wallet?.balance ?? 0) };
});

export const settleDueRealTrades = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = serviceDatabase();
  const { data: due, error } = await db.from('real_trades').select('id,symbol,expires_at').eq('user_id', context.userId).eq('status', 'open').lte('expires_at', new Date().toISOString()).order('expires_at').limit(30);
  if (error) throw new Error('Could not check for expired real trades');
  for (const trade of due ?? []) {
    const quote = await inhouseQuote(db, trade.symbol).catch(() => null);
    if (!quote || quote.timestamp < Date.parse(trade.expires_at)) continue;
    const { error: settlementError } = await db.rpc('settle_real_trade', { p_trade_id: trade.id, p_close_price: quote.price, p_close_candle_ts: quote.candleTs });
    if (settlementError) {
      console.error(`Could not settle live trade ${trade.id}:`, settlementError);
      throw new Error(`Could not settle an expired live trade: ${settlementError.message}`);
    }
  }
  const [wallet, trades, settings] = await Promise.all([
    db.from('funding_wallets').select('balance').eq('user_id', context.userId).eq('asset', 'USDT').maybeSingle(),
    db.from('real_trades').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(100),
    db.from('site_settings').select('real_trading_enabled,real_min_stake,real_max_stake').eq('id', true).maybeSingle(),
  ]);
  if (wallet.error || trades.error || settings.error) throw new Error('Could not refresh real account');
  return { balance: Number(wallet.data?.balance ?? 0), trades: trades.data ?? [], settings: { enabled: settings.data?.real_trading_enabled ?? false, minStake: Number(settings.data?.real_min_stake ?? 1), maxStake: Number(settings.data?.real_max_stake ?? 0) } };
});

export const getRealTradingAdmin = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const [reserve, ledger] = await Promise.all([
    context.supabase.from('real_trading_reserves').select('*').eq('asset', 'USDT').single(),
    context.supabase.from('real_trading_reserve_ledger').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  if (reserve.error || ledger.error) throw new Error('Could not load real trading reserve');
  return { reserve: reserve.data, ledger: ledger.data ?? [] };
});

export const adjustRealTradingReserve = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ delta: z.number().finite().max(100000000).min(-100000000).refine((n) => n !== 0), note: z.string().trim().min(8).max(300) }).parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const db = serviceDatabase();
  const { data: rawBalance, error } = await db.rpc('adjust_real_trading_reserve', { p_actor_id: context.userId, p_delta: data.delta, p_note: data.note });
  const balance = rawBalance as number | null;
  if (error || balance === null) throw new Error(error?.message || 'Could not update reserve');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `Adjusted real USDT payout reserve by ${data.delta}` });
  return { balance: Number(balance) };
});
