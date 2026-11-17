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

async function inhouseQuote(db: ReturnType<typeof serviceDatabase>, symbol: string, until?: string) {
  const spec = marketSpec(symbol);
  const { data, error } = await db.rpc('advance_inhouse_market', {
    p_symbol: symbol, p_base_price: spec.base, p_volatility: spec.vol,
    ...(until ? { p_until: until } : {}),
  });
  const tick = data?.[0];
  if (error || !tick) throw new Error(error?.message || 'In-house market price is unavailable');
  return { price: Number(tick.price), timestamp: Date.parse(tick.tick_at), candleTs: Date.parse(tick.tick_at) };
}

export const getInhouseMarketQuote = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ symbol: z.string().max(16) }).parse(value)).handler(async ({ data }) => {
  const db = serviceDatabase();
  const quote = await inhouseQuote(db, data.symbol);
  const spec = marketSpec(data.symbol);
  return { ...quote, bid: quote.price - spec.spread / 2, ask: quote.price + spec.spread / 2 };
});

export const getInhouseMarketHistory = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ symbol: z.string().max(16), limit: z.number().int().min(10).max(3600) }).parse(value)).handler(async ({ data }) => {
  const db = serviceDatabase();
  await inhouseQuote(db, data.symbol);
  const { data: rows, error } = await db.from('inhouse_market_ticks').select('tick_at,price').eq('symbol', data.symbol).order('tick_at', { ascending: false }).limit(data.limit);
  if (error) throw new Error('Could not load in-house price history');
  return (rows ?? []).reverse().map((row) => ({ time: Math.floor(Date.parse(row.tick_at) / 1000), price: Number(row.price) }));
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
    const quote = await inhouseQuote(db, trade.symbol, trade.expires_at).catch(() => null);
    if (!quote) continue;
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
