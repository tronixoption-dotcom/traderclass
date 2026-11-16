import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { requireStaff } from './admin-session.server';

const methodInput = z.object({
  id: z.string().uuid().optional(), code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,32}$/),
  name: z.string().trim().min(2).max(48), asset: z.enum(['USD','USDT']), network: z.string().trim().min(2).max(48),
  deposit_address: z.string().trim().min(8).max(220), instructions: z.string().trim().max(500),
  min_amount: z.number().positive().max(1_000_000), max_amount: z.number().positive().max(1_000_000),
  deposits_enabled: z.boolean(), withdrawals_enabled: z.boolean(), sort_order: z.number().int().min(0).max(9999),
}).refine((value) => value.max_amount >= value.min_amount, 'Maximum must be at least the minimum');

export const loadFunding = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [methods, wallets, transactions, deposits] = await Promise.all([
    context.supabase.from('funding_methods').select('*').or('deposits_enabled.eq.true,withdrawals_enabled.eq.true').order('sort_order'),
    context.supabase.from('funding_wallets').select('asset,balance').eq('user_id', context.userId),
    context.supabase.from('funding_transactions').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(50),
    context.supabase.from('funding_transactions').select('id', { count: 'exact', head: true }).eq('user_id', context.userId).eq('kind', 'deposit').eq('status', 'completed'),
  ]);
  if (methods.error || wallets.error || transactions.error || deposits.error) throw new Error('Could not load funding options');
  return { methods: methods.data ?? [], wallets: wallets.data ?? [], transactions: transactions.data ?? [], isActivated: (deposits.count ?? 0)>0 };
});

const cryptoAmount = z.number().positive().max(1_000_000).refine((amount) => Number.isInteger(amount * 100_000_000), 'Amount supports up to 8 decimal places');
export const requestFundingDeposit = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ methodId: z.string().uuid(), amount: cryptoAmount, reference: z.string().trim().max(180) }).parse(value)).handler(async ({ data, context }) => {
  const { data: id, error } = await context.supabase.rpc('request_funding_deposit', { p_method_id: data.methodId, p_amount: data.amount, p_reference: data.reference });
  if (error || !id) throw new Error(error?.message ?? 'Could not submit deposit');
  return { id };
});

export const requestFundingWithdrawal = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ methodId: z.string().uuid(), amount: cryptoAmount, destination: z.string().trim().min(5).max(180) }).parse(value)).handler(async ({ data, context }) => {
  const { data: id, error } = await context.supabase.rpc('request_funding_withdrawal', { p_method_id: data.methodId, p_amount: data.amount, p_destination: data.destination });
  if (error || !id) throw new Error(error?.message ?? 'Could not submit withdrawal');
  return { id };
});

export const getFundingAdmin = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const [methods, transactions, profiles] = await Promise.all([
    context.supabase.from('funding_methods').select('*').order('sort_order'),
    context.supabase.from('funding_transactions').select('*').in('status', ['under_review','processing']).order('created_at'),
    context.supabase.from('profiles').select('id,username'),
  ]);
  if (methods.error || transactions.error || profiles.error) throw new Error('Could not load funding administration');
  return { methods: methods.data ?? [], transactions: transactions.data ?? [], profiles: profiles.data ?? [] };
});

export const saveFundingMethod = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => methodInput.parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const row = { ...data, provider: 'crypto', updated_at: new Date().toISOString() };
  const { error } = await context.supabase.from('funding_methods').upsert(row, { onConflict: 'id' });
  if (error) throw new Error('Could not save payment method');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `Saved deposit method ${data.name}` });
  return { ok: true };
});

export const reviewFundingTransaction = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().trim().max(500) }).parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const { error } = await context.supabase.rpc('review_funding_transaction', { p_transaction_id: data.id, p_approve: data.approve, p_note: data.note });
  if (error) throw new Error(error.message || 'Could not review transaction');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `${data.approve ? 'Approved' : 'Rejected'} funding transaction ${data.id}` });
  return { ok: true };
});
