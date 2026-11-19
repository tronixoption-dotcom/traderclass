import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { getWallet, startB2cWithdrawal, startStkDeposit, startUsdtB2cWithdrawal } from './mpesa.server';

const paymentInput = (data: unknown) => z.object({ amountKes: z.number().int().min(1).max(150_000), phone: z.string().trim().min(9).max(16) }).parse(data);

export const loadMpesaWallet = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) =>
  getWallet(context.userId),
);

export const initiateMpesaDeposit = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(paymentInput).handler(async ({ data, context }) =>
  startStkDeposit(context.userId, data.amountKes, data.phone),
);

export const requestMpesaWithdrawal = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(paymentInput).handler(async ({ data, context }) =>
  startB2cWithdrawal(context.userId, data.amountKes, data.phone),
);

export const requestUsdtMpesaWithdrawal = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((value: unknown) => z.object({ amountUsdt: z.number().positive().max(1000000), phone: z.string().trim().min(9).max(16) }).parse(value)).handler(async ({ data, context }) =>
  startUsdtB2cWithdrawal(context.userId, data.amountUsdt, data.phone),
);
