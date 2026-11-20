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
  stake: z.number().positive(), duration: z.number().int(), byRobot: z.boolean().optional().default(false), marketSource: z.enum(['okx', 'inhouse']).optional().default('okx'),
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

async function okxQuote(symbol: string, maxAgeMs = 5000) {
  const instId = okxInstrument(symbol);
  const response = await fetch(`https://www.okx.com/api/v5/market/books?instId=${encodeURIComponent(instId)}&sz=1`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw new Error(`OKX market request failed (${response.status})`);
  const payload = await response.json() as { code?: string; msg?: string; data?: Array<{ bids: string[][]; asks: string[][]; ts: string }> };
  const row = payload.data?.[0];
  const bid = Number(row?.bids?.[0]?.[0]);
  const ask = Number(row?.asks?.[0]?.[0]);
  const price = (bid + ask) / 2;
  const sourceTimestamp = Number(row?.ts);
  const receivedAt = Date.now();
  if (payload.code !== '0' || !row || !Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ask) || ask < bid || !Number.isFinite(price) || !Number.isFinite(sourceTimestamp) || sourceTimestamp > receivedAt + 1000 || receivedAt - sourceTimestamp > maxAgeMs) {
    throw new Error(payload.msg || `No fresh OKX order book for ${instId}`);
  }
  // OKX book ts is the last order-book change, not the time this fresh snapshot was read.
  // Use server receipt time for trade expiry and settlement after validating source freshness.
  return { price, bid, ask, timestamp: receivedAt, candleTs: receivedAt, instId };
}

async function saveQuote(db: ReturnType<typeof serviceDatabase>, symbol: string, quote: { price: number; timestamp: number }) {
  const { error } = await db.from('inhouse_market_ticks').upsert({ symbol, tick_at: new Date(quote.timestamp).toISOString(), price: quote.price });
  if (error) throw new Error('Could not save the market settlement quote');
}

async function marketQuote(db: ReturnType<typeof serviceDatabase>, symbol: string, source: 'okx' | 'inhouse') {
  if (source === 'okx') {
    const quote = await okxQuote(symbol);
    await saveQuote(db, symbol, quote);
    return { ...quote, source };
  }
  const spec = marketSpec(symbol);
  const { data, error } = await db.rpc('advance_inhouse_market', { p_symbol: symbol, p_base_price: spec.base, p_volatility: spec.vol });
  const tick = data?.[0];
  if (error || !tick) throw new Error(error?.message || 'In-house market price is unavailable');
  const price = Number(tick.price);
  // In-house prices use whole-second ticks; settlement accepts the same 1s
  // boundary tolerance as the database function below.
  const timestamp = Date.parse(tick.tick_at);
  return { price, bid: price - spec.spread / 2, ask: price + spec.spread / 2, timestamp, candleTs: timestamp, source };
}

async function realTradingSettings(db: ReturnType<typeof serviceDatabase>, userId: string) {
  const [settings, reserve, controls] = await Promise.all([
    db.from('site_settings').select('real_trading_enabled,real_min_stake,real_max_stake,real_rtp_target_percent,user_real_win_rate_percent,agent_real_win_rate_percent').eq('id', true).maybeSingle(),
    db.from('real_trading_reserves').select('available').eq('asset', 'USDT').maybeSingle(),
    db.from('client_wallet_controls').select('agent_enabled').eq('user_id', userId).maybeSingle(),
  ]);
  if (settings.error || reserve.error || controls.error) throw new Error('Could not load real trading limits');
  const winRate = Number(controls.data?.agent_enabled ? settings.data?.agent_real_win_rate_percent : settings.data?.user_real_win_rate_percent) || 0;
  const payoutMultiplier = winRate === 0 ? 1 : Math.max(1, Number(settings.data?.real_rtp_target_percent ?? 95) / winRate);
  const profitPerStake = payoutMultiplier - 1;
  const availableReserve = Number(reserve.data?.available ?? 0);
  return {
    enabled: settings.data?.real_trading_enabled ?? false,
    minStake: Number(settings.data?.real_min_stake ?? 1),
    maxStake: Number(settings.data?.real_max_stake ?? 0),
    reserveMaxStake: profitPerStake > 0 ? availableReserve / profitPerStake : Number.MAX_SAFE_INTEGER,
  };
}

export const getInhouseMarketQuote = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ symbol: z.string().max(16), source: z.enum(['okx', 'inhouse']).default('okx') }).parse(value)).handler(async ({ data }) => {
  const db = serviceDatabase();
  return marketQuote(db, data.symbol, data.source);
});

export const getInhouseMarketHistory = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ symbol: z.string().max(16), limit: z.number().int().min(10).max(3600), timeframe: z.number().int().optional(), source: z.enum(['okx', 'inhouse']).default('okx') }).parse(value)).handler(async ({ data }) => {
  if (data.source === 'inhouse') {
    const db = serviceDatabase();
    const spec = marketSpec(data.symbol);
    await db.rpc('advance_inhouse_market', { p_symbol: data.symbol, p_base_price: spec.base, p_volatility: spec.vol });
    const { data: rows, error } = await db.from('inhouse_market_ticks').select('tick_at,price').eq('symbol', data.symbol).order('tick_at', { ascending: false }).limit(Math.min(data.limit, 3600));
    if (error) throw new Error('Could not load in-house market history');
    return (rows ?? []).reverse().map((row) => ({ time: Math.floor(Date.parse(row.tick_at) / 1000), price: Number(row.price) }));
  }
  const instId = okxInstrument(data.symbol);
  const bar = data.timeframe && data.timeframe >= 86400 ? '1D' : data.timeframe && data.timeframe >= 14400 ? '4H' : data.timeframe && data.timeframe >= 3600 ? '1H' : data.timeframe && data.timeframe >= 1800 ? '30m' : data.timeframe && data.timeframe >= 900 ? '15m' : data.timeframe && data.timeframe >= 300 ? '5m' : '1m';
  const response = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${Math.min(data.limit, 300)}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load OKX market history');
  const payload = await response.json() as { code?: string; data?: string[][] };
  if (payload.code !== '0' || !payload.data?.length) throw new Error('OKX market history is unavailable');
  return payload.data.slice().reverse().map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
  }));
});

export const getRealTradingData = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = serviceDatabase();
  const [wallet, trades, settings] = await Promise.all([
    context.supabase.from('funding_wallets').select('balance').eq('user_id', context.userId).eq('asset', 'USDT').maybeSingle(),
    context.supabase.from('real_trades').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(100),
    realTradingSettings(db, context.userId),
  ]);
  if (wallet.error || trades.error) throw new Error('Could not load the real account');
  return { balance: Number(wallet.data?.balance ?? 0), trades: trades.data ?? [], settings };
});

export const placeRealTrade = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => tradeInput.parse(value)).handler(async ({ data, context }) => {
  if (![5, 10, 15, 30, 60, 120, 300].includes(data.duration)) throw new Error('Choose a supported trade duration');
  const db = serviceDatabase();
  const quote = await marketQuote(db, data.symbol, data.marketSource);
  if (data.marketSource === 'okx' && Date.now() - quote.timestamp > 5000) throw new Error('The OKX quote is stale; wait for a fresh market update');
  const entryPrice = data.direction === 'buy' ? quote.ask : quote.bid;
  const { data: tradeId, error } = await db.rpc('open_real_trade', {
    p_user_id: context.userId, p_symbol: data.symbol, p_inst_id: data.symbol, p_direction: data.direction,
    p_stake: data.stake, p_duration_seconds: data.duration, p_entry_price: entryPrice,
    p_entry_price_ts: quote.timestamp, p_request_id: data.requestId, p_by_robot: data.byRobot,
  });
  if (error || !tradeId) throw new Error(error?.message || 'Could not open the real trade');
  const { error: sourceError } = await db.from('real_trades').update({ market_source: data.marketSource }).eq('id', tradeId).eq('user_id', context.userId);
  if (sourceError) throw new Error('Trade opened but its market source could not be saved');
  const { data: trade, error: tradeError } = await db.from('real_trades').select('*').eq('id', tradeId).eq('user_id', context.userId).single();
  if (tradeError || !trade) throw new Error('Trade was opened but could not be loaded');
  const { data: wallet } = await db.from('funding_wallets').select('balance').eq('user_id', context.userId).eq('asset', 'USDT').maybeSingle();
  return { trade, balance: Number(wallet?.balance ?? 0) };
});

export const settleDueRealTrades = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = serviceDatabase();
  const { data: due, error } = await db.from('real_trades').select('id,symbol,expires_at,market_source').eq('user_id', context.userId).eq('status', 'open').lte('expires_at', new Date().toISOString()).order('expires_at').limit(30);
  if (error) throw new Error('Could not check for expired real trades');
  const settlementErrors: string[] = [];
  for (const trade of due ?? []) {
    let quote: Awaited<ReturnType<typeof marketQuote>>;
    try { quote = await marketQuote(db, trade.symbol, trade.market_source); }
    catch (error) {
      settlementErrors.push(error instanceof Error ? error.message : 'Could not load a settlement quote');
      continue;
    }
    // The database checks its own expiry clock. Don't pre-reject based on a
    // quote timestamp from another clock; both OKX freshness and in-house
    // generation have already been validated by marketQuote above.
    const { error: settlementError } = await db.rpc('settle_real_trade', { p_trade_id: trade.id, p_close_price: quote.price, p_close_candle_ts: Date.now() });
    if (settlementError) {
      console.error(`Could not settle live trade ${trade.id}:`, settlementError);
      settlementErrors.push(settlementError.message);
    }
  }
  const [wallet, trades, settings] = await Promise.all([
    db.from('funding_wallets').select('balance').eq('user_id', context.userId).eq('asset', 'USDT').maybeSingle(),
    db.from('real_trades').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(100),
    realTradingSettings(db, context.userId),
  ]);
  if (wallet.error || trades.error) throw new Error('Could not refresh real account');
  return { balance: Number(wallet.data?.balance ?? 0), trades: trades.data ?? [], settings, settlementErrors };
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

export const setRealTradingReserveBalance = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ total: z.number().finite().min(0).max(100000000), note: z.string().trim().min(8).max(300) }).parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const db = serviceDatabase();
  const { data: available, error } = await db.rpc('set_real_trading_reserve_total', { p_actor_id: context.userId, p_total: data.total, p_note: data.note });
  if (error || available === null) throw new Error(error?.message || 'Could not reconcile reserve balance');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `Reconciled company USDT payout reserve to ${data.total}` });
  return { available: Number(available) };
});
