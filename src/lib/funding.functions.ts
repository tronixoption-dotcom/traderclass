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
const configuredMethodInput = methodInput.refine((value) => value.asset === 'USDT' && value.min_amount >= 10, 'Crypto deposits must use USDT with a minimum of 10 USDT').refine((value) => !value.deposits_enabled || !value.deposit_address.toUpperCase().startsWith('UNCONFIGURED-'), 'Set the real receiving wallet address before enabling deposits');

export const loadFunding = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [methods, wallets, transactions, deposits, settings, controls] = await Promise.all([
    context.supabase.from('funding_methods').select('*').order('sort_order'),
    context.supabase.from('funding_wallets').select('asset,balance').eq('user_id', context.userId),
    context.supabase.from('funding_transactions').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(50),
    context.supabase.from('funding_transactions').select('id', { count: 'exact', head: true }).eq('user_id', context.userId).eq('kind', 'deposit').eq('status', 'completed'),
    context.supabase.from('site_settings').select('deposit_fee_percent,withdrawal_fee_percent,kes_per_usdt').eq('id', true).maybeSingle(),
    context.supabase.from('client_wallet_controls').select('deposits_enabled,withdrawals_enabled').eq('user_id', context.userId).maybeSingle(),
  ]);
  if (methods.error || wallets.error || transactions.error || deposits.error || settings.error || controls.error) throw new Error('Could not load funding options');
  return { methods: methods.data ?? [], wallets: wallets.data ?? [], transactions: transactions.data ?? [], isActivated: (deposits.count ?? 0)>0, depositFeePercent: Number(settings.data?.deposit_fee_percent ?? 0), withdrawalFeePercent: Number(settings.data?.withdrawal_fee_percent ?? 0), kesPerUsdt: Number(settings.data?.kes_per_usdt ?? 130.05), accountControls: { depositsEnabled: controls.data?.deposits_enabled ?? true, withdrawalsEnabled: controls.data?.withdrawals_enabled ?? true } };
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
  const roles = await requireStaff(context.supabase, context.userId, context.claims);
  if (!roles.includes('admin') && !roles.includes('agent')) throw new Error('Funding access required');
  const [methods, transactions, mpesaTransactions, profiles] = await Promise.all([
    context.supabase.from('funding_methods').select('*').order('sort_order'),
    context.supabase.from('funding_transactions').select('*').order('created_at', { ascending: false }).limit(1000),
    context.supabase.from('mpesa_transactions').select('id,user_id,kind,status,amount_kes,phone_number,mpesa_receipt_number,result_description,created_at,fee_amount_kes,net_amount_kes,converted_usdt,source_asset,source_amount_usdt,conversion_rate').order('created_at', { ascending: false }).limit(1000),
    context.supabase.from('profiles').select('id,username'),
  ]);
  if (methods.error || transactions.error || mpesaTransactions.error || profiles.error) throw new Error('Could not load funding administration');
  const { data: controls, error: controlsError } = roles.includes('admin') ? await context.supabase.from('client_wallet_controls').select('*') : { data: [], error: null };
  if (controlsError) throw new Error('Could not load funding administration');
  return { methods: methods.data ?? [], transactions: transactions.data ?? [], mpesaTransactions: mpesaTransactions.data ?? [], profiles: profiles.data ?? [], controls: controls ?? [], canReview: roles.includes('admin') };
});

export const reviewMpesaTransaction = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().trim().max(500).default(''), receipt: z.string().trim().max(64).default('') }).parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const { error } = await context.supabase.rpc('admin_review_mpesa_transaction', { p_transaction_id: data.id, p_approve: data.approve, p_note: data.note, p_receipt: data.receipt || null });
  if (error) throw new Error(error.message || 'Could not review M-Pesa transaction');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `${data.approve ? 'Approved' : 'Rejected'} M-Pesa ${data.id}` });
  return { ok: true };
});

export const saveFundingMethod = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => configuredMethodInput.parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const { id, ...fields } = data;
  const row = { ...(id ? { id } : {}), ...fields, provider: 'crypto', updated_at: new Date().toISOString() };
  const { error } = await context.supabase.from('funding_methods').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(error.message || 'Could not save payment method');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `Saved deposit method ${data.name}` });
  return { ok: true };
});

export const reviewFundingTransaction = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().trim().max(500) }).parse(value)).handler(async ({ data, context }) => {
  const roles = await requireStaff(context.supabase, context.userId, context.claims);
  if (!roles.includes('admin') && !roles.includes('agent')) throw new Error('Funding access required');
  const { error } = await context.supabase.rpc('review_funding_transaction', { p_transaction_id: data.id, p_approve: data.approve, p_note: data.note });
  if (error) throw new Error(error.message || 'Could not review transaction');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `${data.approve ? 'Approved' : 'Rejected'} funding transaction ${data.id}` });
  return { ok: true };
});

export const creditClientWallet = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ userId: z.string().uuid(), amount: z.number().positive().max(1_000_000).refine((amount) => Number.isInteger(amount * 100_000_000), 'Amount supports up to 8 decimal places'), note: z.string().trim().max(500) }).parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const { error } = await context.supabase.rpc('admin_credit_client_wallet', { p_user_id: data.userId, p_amount: data.amount, p_note: data.note });
  if (error) throw new Error(error.message || 'Could not credit client wallet');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `Credited ${data.amount} USDT to client ${data.userId}` });
  return { ok: true };
});

export const setClientWalletControl = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ userId: z.string().uuid(), field: z.enum(['agent_enabled', 'deposits_enabled', 'withdrawals_enabled']), enabled: z.boolean() }).parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const { error } = await context.supabase.rpc('admin_set_client_wallet_control', { p_user_id: data.userId, p_field: data.field, p_enabled: data.enabled });
  if (error) throw new Error(error.message || 'Could not update client account controls');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `Set ${data.field}=${data.enabled} for client ${data.userId}` });
  return { ok: true };
});

export const debitClientWallet = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ userId: z.string().uuid(), amount: z.number().positive().max(1_000_000).refine((amount) => Number.isInteger(amount * 100_000_000), 'Amount supports up to 8 decimal places'), note: z.string().trim().max(500) }).parse(value)).handler(async ({ data, context }) => {
  await requireStaff(context.supabase, context.userId, context.claims, true);
  const { error } = await context.supabase.rpc('admin_debit_client_wallet', { p_user_id: data.userId, p_amount: data.amount, p_note: data.note });
  if (error) throw new Error(error.message || 'Could not debit client wallet');
  await context.supabase.from('admin_audit').insert({ actor_id: context.userId, action: `Debited ${data.amount} USDT from client ${data.userId}` });
  return { ok: true };
});
