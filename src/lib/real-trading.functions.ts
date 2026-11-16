import { createClient } from '@supabase/supabase-js';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';
import { requireStaff } from './admin-session.server';
import { getOkxEntryQuote, getOkxSettlementCandle, okxInstrument } from './okx-market.server';

function serviceDatabase() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SECRET_ROLE_KEY'];
  if (!url || !key) throw new Error('Real trading backend is not configured');
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const tradeInput = z.object({
  requestId: z.string().uuid(), symbol: z.string().max(16), direction: z.enum(['buy', 'sell']),
  stake: z.number().positive().max(100000), duration: z.number().int(), byRobot: z.boolean().optional().default(false),
});

export const getRealTradingData = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [wallet, trades, settings] = await Promise.all([
    context.supabase.from('funding_wallets').select('balance').eq('user_id', context.userId).eq('asset', 'USDT').maybeSingle(),
    context.supabase.from('real_trades').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(100),
    context.supabase.from('site_settings').select('real_trading_enabled,real_min_stake,real_max_stake').eq('id', true).maybeSingle(),
  ]);
  if (wallet.error || trades.error || settings.error) throw new Error('Could not load the real account');
  return { balance: Number(wallet.data?.balance ?? 0), trades: trades.data ?? [], settings: { enabled: settings.data?.real_trading_enabled ?? false, minStake: Number(settings.data?.real_min_stake ?? 1), maxStake: Number(settings.data?.real_max_stake ?? 100) } };
});

export const placeRealTrade = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => tradeInput.parse(value)).handler(async ({ data, context }) => {
  const instId = okxInstrument(data.symbol);
  if (![5, 10, 15, 30, 60, 120, 300].includes(data.duration)) throw new Error('Choose a supported trade duration');
  const quote = await getOkxEntryQuote(data.symbol);
  if (quote.instId !== instId) throw new Error('Instrument mismatch');
  const db = serviceDatabase();
  const { data: tradeId, error } = await db.rpc('open_real_trade', {
    p_user_id: context.userId, p_symbol: data.symbol, p_inst_id: instId, p_direction: data.direction,
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
  const { data: due, error } = await db.from('real_trades').select('id,inst_id,expires_at').eq('user_id', context.userId).eq('status', 'open').lte('expires_at', new Date().toISOString()).order('expires_at').limit(30);
  if (error) throw new Error('Could not check for expired real trades');
  for (const trade of due ?? []) {
    const candle = await getOkxSettlementCandle(trade.inst_id, trade.expires_at).catch(() => null);
    if (!candle) continue;
    await db.rpc('settle_real_trade', { p_trade_id: trade.id, p_close_price: candle.close, p_close_candle_ts: candle.candleTs });
  }
  const [wallet, trades, settings] = await Promise.all([
    db.from('funding_wallets').select('balance').eq('user_id', context.userId).eq('asset', 'USDT').maybeSingle(),
    db.from('real_trades').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(100),
    db.from('site_settings').select('real_trading_enabled,real_min_stake,real_max_stake').eq('id', true).maybeSingle(),
  ]);
  if (wallet.error || trades.error || settings.error) throw new Error('Could not refresh real account');
  return { balance: Number(wallet.data?.balance ?? 0), trades: trades.data ?? [], settings: { enabled: settings.data?.real_trading_enabled ?? false, minStake: Number(settings.data?.real_min_stake ?? 1), maxStake: Number(settings.data?.real_max_stake ?? 100) } };
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

export const adjustRealTradingReserve = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ delta: z.number().finite().refine((n) => n !== 0).max(100000000).min(-100000000), note: z.string().trim().min(8).max(300) }).parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const db = serviceDatabase();
  const { data: balance, error } = await db.rpc('adjust_real_trading_reserve', { p_actor_id: context.userId, p_delta: data.delta, p_note: data.note });
  if (error || balance === null) throw new Error(error?.message || 'Could not update reserve');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `Adjusted real USDT payout reserve by ${data.delta}` });
  return { balance: Number(balance) };
});
