import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';

type Db = SupabaseClient<any>;
class DarajaRejectedError extends Error {}

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

function database(): Db {
  const url = required('SUPABASE_URL');
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SUPABASE_SECRET_ROLE_KEY'];
  if (!key) throw new Error('Missing server environment variable: SUPABASE_SERVICE_ROLE_KEY');
  return createClient<any>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requirePaymentsEnabled(db: Db, payment: 'deposit' | 'withdrawal') {
  const column = payment === 'deposit' ? 'deposits_enabled' : 'withdrawals_enabled';
  const { data, error } = await db.from('site_settings').select('deposits_enabled,withdrawals_enabled').eq('id', true).maybeSingle();
  if (error || !data) throw new Error('M-Pesa payment settings are unavailable');
  const enabled = payment === 'deposit' ? data.deposits_enabled : data.withdrawals_enabled;
  if (!enabled) throw new Error(`M-Pesa ${payment}s are currently paused`);
}

function darajaBase() {
  const env = required('DARAJA_ENV').toLowerCase();
  if (env !== 'production' && env !== 'sandbox') throw new Error('DARAJA_ENV must be production or sandbox');
  return env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
}

function callbackUrl(name: string) {
  const value = required(name);
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
  return parsed.toString();
}

let accessToken: { value: string; expiresAt: number } | undefined;
async function token() {
  if (accessToken && accessToken.expiresAt > Date.now() + 30_000) return accessToken.value;
  const credentials = Buffer.from(`${required('DARAJA_CONSUMER_KEY')}:${required('DARAJA_CONSUMER_SECRET')}`).toString('base64');
  const response = await fetch(`${darajaBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  const data = await response.json() as { access_token?: string; expires_in?: string | number };
  if (!response.ok || !data.access_token) throw new Error('Daraja authentication failed');
  accessToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 3599) * 1000 };
  return accessToken.value;
}

async function darajaPost(path: string, payload: Record<string, unknown>, bearerToken?: string) {
  const response = await fetch(`${darajaBase()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearerToken ?? await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data['errorMessage'] === 'string' ? data['errorMessage'] : 'Daraja request failed; transaction status may need reconciliation');
  if (data['ResponseCode'] !== undefined && String(data['ResponseCode']) !== '0') {
    throw new DarajaRejectedError(typeof data['ResponseDescription'] === 'string' ? data['ResponseDescription'] : 'Daraja rejected the transaction');
  }
  return data;
}

function phoneNumber(input: string) {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('2540')) digits = `254${digits.slice(4)}`;
  const normalized = digits.startsWith('0') ? `254${digits.slice(1)}` : digits.startsWith('254') ? digits : `254${digits}`;
  if (!/^254(?:7|1)\d{8}$/.test(normalized)) throw new Error('Enter a valid Kenyan M-Pesa phone number');
  return normalized;
}

async function registeredMpesaNumber(db: Db, userId: string) {
  const { data, error } = await db.from('profiles').select('phone').eq('id', userId).maybeSingle();
  if (error) throw new Error('Could not load your registered M-Pesa number');
  if (!data?.phone?.trim()) throw new Error('Add your M-Pesa number in Profile before making an M-Pesa transaction');
  try { return phoneNumber(data.phone); }
  catch { throw new Error('Your registered number cannot receive M-Pesa. Update it to a Kenyan number in Profile.'); }
}

function amount(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 150_000) throw new Error('Amount must be a whole KES value between 1 and 150,000');
  return value;
}

function b2cConfig() {
  return {
    initiator: required('DARAJA_B2C_INITIATOR_NAME'), credential: required('DARAJA_B2C_SECURITY_CREDENTIAL'),
    shortcode: required('DARAJA_B2C_SHORTCODE'), queueUrl: callbackUrl('DARAJA_B2C_QUEUE_URL'), resultUrl: callbackUrl('DARAJA_B2C_RESULT_URL'),
  };
}

async function submitB2cPayout(db: Db, txId: string, phone: string, bearer: string, config: ReturnType<typeof b2cConfig>) {
  const { data: payout, error: payoutError } = await db.from('mpesa_transactions').select('net_amount_kes').eq('id', txId).single();
  if (payoutError || !payout) {
    await db.rpc('finish_mpesa_transaction', { p_transaction_id: txId, p_success: false, p_result_code: 'PAYOUT_AMOUNT_READ_FAILED', p_description: 'Could not read the payout amount; reserved funds were returned.' });
    throw new Error('Could not load the payout amount; the reserved balance was returned');
  }
  try {
    const result = await darajaPost('/mpesa/b2c/v1/paymentrequest', {
      InitiatorName: config.initiator, SecurityCredential: config.credential, CommandID: 'BusinessPayment', Amount: Number(payout.net_amount_kes),
      PartyA: config.shortcode, PartyB: phone, Remarks: 'Tradeclass wallet withdrawal', QueueTimeOutURL: config.queueUrl,
      ResultURL: config.resultUrl, Occasion: txId,
    }, bearer);
    const { error: updateError } = await db.from('mpesa_transactions').update({
      conversation_id: result['ConversationID'], originator_conversation_id: result['OriginatorConversationID'],
    }).eq('id', txId);
    if (updateError) {
      console.error('Accepted Daraja payout could not save its callback reference', txId);
      return { ok: true, message: 'Payout was accepted and is awaiting callback reconciliation. The reserved balance has not been released.' };
    }
    return { ok: true, message: 'Withdrawal submitted. Your balance is reserved until Safaricom confirms the result.' };
  } catch (error) {
    if (error instanceof DarajaRejectedError) await db.rpc('finish_mpesa_transaction', { p_transaction_id: txId, p_success: false, p_result_code: 'DARAJA_REJECTED', p_description: error.message.slice(0, 200) });
    throw new Error(error instanceof Error ? error.message : 'Could not start the M-Pesa withdrawal');
  }
}

export async function startStkDeposit(userId: string, rawAmount: number) {
  const kes = amount(rawAmount);
  const db = database();
  const phone = await registeredMpesaNumber(db, userId);
  darajaBase();
  const shortcode = required('DARAJA_STK_SHORTCODE');
  const passkey = required('DARAJA_STK_PASSKEY');
  const callback = callbackUrl('DARAJA_CALLBACK_URL');
  const bearer = await token();
  await requirePaymentsEnabled(db, 'deposit');
  const { data: walletControl, error: controlError } = await db.from('client_wallet_controls').select('deposits_enabled').eq('user_id', userId).maybeSingle();
  if (controlError) throw new Error('Could not check deposit access');
  if (walletControl && !walletControl.deposits_enabled) throw new Error('Deposits are disabled for this account');
  const { data: paymentSettings, error: settingsError } = await db.from('site_settings').select('deposit_fee_percent,kes_per_usdt').eq('id', true).single();
  if (settingsError || !paymentSettings) throw new Error('Could not load deposit fee settings');
  const feeKes = Math.round(kes * Number(paymentSettings.deposit_fee_percent ?? 0) / 100);
  const netKes = kes - feeKes;
  if (netKes < 1) throw new Error('Deposit amount must be greater than its fee');
  const conversionRate = Number(paymentSettings.kes_per_usdt);
  if (!Number.isFinite(conversionRate) || conversionRate <= 0) throw new Error('M-Pesa exchange rate is unavailable');
  const convertedUsdt = Number((netKes / conversionRate).toFixed(8));
  if (convertedUsdt <= 0) throw new Error('Deposit is too small to convert into USDT');
  const { count, error: countError } = await db.from('mpesa_transactions').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('kind', 'deposit').eq('status', 'pending').gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString());
  if (countError) throw new Error('Could not check recent payment requests');
  if ((count ?? 0) >= 3) throw new Error('Please wait for your pending M-Pesa requests to finish');

  const { data: tx, error } = await db.from('mpesa_transactions').insert({ user_id: userId, kind: 'deposit', status: 'pending', amount_kes: kes, fee_amount_kes: feeKes, net_amount_kes: netKes, phone_number: phone, conversion_rate: conversionRate, converted_usdt: convertedUsdt }).select('id').single();
  if (error || !tx) throw new Error('Could not create the deposit request');
  try {
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const result = await darajaPost('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: shortcode, Password: password, Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline', Amount: kes, PartyA: phone, PartyB: shortcode,
      PhoneNumber: phone, CallBackURL: callback,
      AccountReference: `GM${String(tx.id).replaceAll('-', '').slice(0, 10)}`,
      TransactionDesc: 'Tradeclass wallet deposit',
    }, bearer);
    const checkoutId = result['CheckoutRequestID'];
    if (typeof checkoutId !== 'string') throw new Error('Daraja did not return a checkout request ID');
    const { error: updateError } = await db.from('mpesa_transactions').update({ checkout_request_id: checkoutId, merchant_request_id: result['MerchantRequestID'] }).eq('id', tx.id);
    if (updateError) throw new Error('Could not save the M-Pesa checkout reference');
    return { ok: true, message: 'Check your phone and enter your M-Pesa PIN to complete the deposit.' };
  } catch (error) {
    if (error instanceof DarajaRejectedError) await db.rpc('finish_mpesa_transaction', { p_transaction_id: tx.id, p_success: false, p_result_code: 'DARAJA_REJECTED', p_description: error.message.slice(0, 200) });
    throw new Error(error instanceof Error ? error.message : 'Could not start the M-Pesa payment');
  }
}

export async function startB2cWithdrawal(userId: string, rawAmount: number) {
  const kes = amount(rawAmount);
  const db = database();
  const phone = await registeredMpesaNumber(db, userId);
  darajaBase();
  const config = b2cConfig();
  const bearer = await token();
  await requirePaymentsEnabled(db, 'withdrawal');
  const { data: walletControl, error: controlError } = await db.from('client_wallet_controls').select('withdrawals_enabled').eq('user_id', userId).maybeSingle();
  if (controlError) throw new Error('Could not check withdrawal access');
  if (walletControl && !walletControl.withdrawals_enabled) throw new Error('Withdrawals are disabled for this account');
  const [mpesaDeposits, otherDeposits] = await Promise.all([
    db.from('mpesa_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'deposit').eq('status', 'completed'),
    db.from('funding_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'deposit').eq('status', 'completed'),
  ]);
  if (mpesaDeposits.error || otherDeposits.error) throw new Error('Could not check account activation');
  if ((mpesaDeposits.count ?? 0) + (otherDeposits.count ?? 0) < 1) throw new Error('Make one successful deposit to activate withdrawals');
  const { count, error: countError } = await db.from('mpesa_transactions').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('kind', 'withdrawal').eq('status', 'processing');
  if (countError) throw new Error('Could not check pending withdrawals');
  if ((count ?? 0) >= 2) throw new Error('Please wait for pending withdrawals to finish');
  const { data: txId, error } = await db.rpc('request_mpesa_withdrawal', { p_user_id: userId, p_amount_kes: kes, p_phone_number: phone });
  if (error || typeof txId !== 'string') throw new Error(error?.message.includes('Insufficient') ? 'Insufficient KES wallet balance' : 'Could not create the withdrawal request');
  return submitB2cPayout(db, txId, phone, bearer, config);
}

export async function startUsdtB2cWithdrawal(userId: string, rawAmount: number) {
  if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > 1_000_000 || Math.round(rawAmount * 1e8) !== rawAmount * 1e8) {
    throw new Error('Enter a valid USDT amount with up to 8 decimal places');
  }
  const db = database();
  const phone = await registeredMpesaNumber(db, userId);
  darajaBase();
  const config = b2cConfig();
  const bearer = await token();
  await requirePaymentsEnabled(db, 'withdrawal');
  const { count, error: countError } = await db.from('mpesa_transactions').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('kind', 'withdrawal').eq('status', 'processing');
  if (countError) throw new Error('Could not check pending withdrawals');
  if ((count ?? 0) >= 2) throw new Error('Please wait for pending withdrawals to finish');
  const { data: txId, error } = await db.rpc('request_usdt_mpesa_withdrawal', {
    p_user_id: userId, p_amount_usdt: rawAmount, p_phone_number: phone,
  });
  if (error || typeof txId !== 'string') throw new Error(error?.message || 'Could not create the USDT withdrawal request');
  return submitB2cPayout(db, txId, phone, bearer, config);
}

export async function getWallet(userId: string) {
  const db = database();
  const [wallet, transactions, deposits] = await Promise.all([
    db.from('mpesa_wallets').select('balance_kes').eq('user_id', userId).maybeSingle(),
    db.from('mpesa_transactions').select('id,kind,status,amount_kes,fee_amount_kes,net_amount_kes,phone_number,mpesa_receipt_number,conversion_rate,converted_usdt,source_asset,source_amount_usdt,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    db.from('mpesa_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'deposit').eq('status', 'completed'),
  ]);
  if (wallet.error || transactions.error || deposits.error) throw new Error('Could not load the M-Pesa wallet');
  return { balanceKes: wallet.data?.balance_kes ?? 0, isActivated: (deposits.count ?? 0) > 0, transactions: transactions.data ?? [] };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const callbackAck = () => json({ ResultCode: 0, ResultDesc: 'Accepted' });

export async function mpesaStkCallback(request: Request) {
  let payload: any;
  try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const callback = payload?.Body?.stkCallback;
  if (!callback || typeof callback.CheckoutRequestID !== 'string' || !Number.isInteger(callback.ResultCode)) return json({ error: 'Invalid callback' }, 400);
  const db = database();
  const { data: tx, error } = await db.from('mpesa_transactions').select('id,amount_kes,phone_number').eq('checkout_request_id', callback.CheckoutRequestID).eq('kind', 'deposit').maybeSingle();
  if (error) return json({ error: 'Database unavailable' }, 503);
  if (!tx) return callbackAck();
  const metadata = callback.CallbackMetadata?.Item ?? [];
  const value = (name: string) => metadata.find((item: any) => item.Name === name)?.Value;
  const success = callback.ResultCode === 0 && Number(value('Amount')) === Number(tx.amount_kes) && String(value('PhoneNumber')) === tx.phone_number;
  const receipt = value('MpesaReceiptNumber');
  const { error: finishError } = await db.rpc('finish_mpesa_transaction', {
    p_transaction_id: tx.id, p_success: success,
    p_result_code: String(callback.ResultCode),
    p_description: String(callback.ResultDesc ?? (success ? 'Completed' : 'Failed')).slice(0, 200),
    p_receipt: typeof receipt === 'string' ? receipt : null,
  });
  return finishError ? json({ error: 'Could not record callback' }, 503) : callbackAck();
}

export async function b2cQueueCallback(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const conversation = payload['ConversationID'];
    if (typeof conversation === 'string') {
      const db = database();
      await db.from('mpesa_transactions').update({ result_description: String(payload['ResultDesc'] ?? 'Queued').slice(0, 200) })
        .eq('conversation_id', conversation).eq('kind', 'withdrawal').eq('status', 'processing');
    }
  } catch { /* Daraja queue callback is an acknowledgement endpoint. */ }
  return callbackAck();
}

export async function b2cResultCallback(request: Request) {
  let payload: any;
  try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const result = payload?.Result;
  if (!result || typeof result.OriginatorConversationID !== 'string' || !Number.isInteger(result.ResultCode)) return json({ error: 'Invalid callback' }, 400);
  const db = database();
  const { data: tx, error } = await db.from('mpesa_transactions').select('id,net_amount_kes').eq('originator_conversation_id', result.OriginatorConversationID).eq('kind', 'withdrawal').maybeSingle();
  if (error) return json({ error: 'Database unavailable' }, 503);
  if (!tx) return callbackAck();
  const items = result.ResultParameters?.ResultParameter ?? [];
  const sentAmount = items.find((item: any) => item.Key === 'TransactionAmount')?.Value;
  if (result.ResultCode === 0 && Number(sentAmount) !== Number(tx.net_amount_kes)) return json({ error: 'Callback amount mismatch' }, 400);
  const receipt = items.find((item: any) => item.Key === 'TransactionReceipt')?.Value;
  const { error: finishError } = await db.rpc('finish_mpesa_transaction', {
    p_transaction_id: tx.id, p_success: result.ResultCode === 0,
    p_result_code: String(result.ResultCode),
    p_description: String(result.ResultDesc ?? '').slice(0, 200),
    p_receipt: typeof receipt === 'string' ? receipt : null,
  });
  return finishError ? json({ error: 'Could not record callback' }, 503) : callbackAck();
}
