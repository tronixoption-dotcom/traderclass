import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, Clock3, Copy, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { PageHeader } from '@/components/app/PageHeader';
import { loadFunding, requestFundingDeposit, requestFundingWithdrawal } from '@/lib/funding.functions';
import { loadMpesaWallet, initiateMpesaDeposit, requestMpesaWithdrawal, requestUsdtMpesaWithdrawal } from '@/lib/mpesa.functions';
import { useStore } from '@/lib/store';

type FundingData = Awaited<ReturnType<typeof loadFunding>>;
type MpesaData = Awaited<ReturnType<typeof loadMpesaWallet>>;
const PRESETS = [10, 25, 50, 100, 250, 500];
const money = (amount: number, asset: string) => `${asset === 'KES' ? 'KES ' : '$'}${Number(amount).toLocaleString('en-US', { maximumFractionDigits: asset === 'KES' ? 0 : 8 })}${asset === 'USDT' ? ' USDT' : ''}`;

export function FundingPage({ mode }: { mode: 'deposit' | 'withdraw' }) {
  const { user, profile } = useStore();
  const [data, setData] = useState<FundingData | null>(null);
  const [mpesa, setMpesa] = useState<MpesaData | null>(null);
  const [methodId, setMethodId] = useState('mpesa');
  const [amount, setAmount] = useState(mode === 'deposit' ? '1000' : '500');
  const [contact, setContact] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const initializedWithdrawAmount = useRef(false);
  const usdtBalance = Number(data?.wallets.find((wallet) => wallet.asset === 'USDT')?.balance ?? 0);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [funding, mpesaWallet] = await Promise.all([loadFunding(), loadMpesaWallet()]);
    setData(funding); setMpesa(mpesaWallet);
  }, [user]);
  useEffect(() => { void refresh().catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load wallet details')); }, [refresh]);
  useEffect(() => {
    if (mode !== 'withdraw' || !data || !mpesa || initializedWithdrawAmount.current) return;
    initializedWithdrawAmount.current = true;
    if (usdtBalance > 0 && methodId === 'mpesa') setAmount(String(Math.min(50, usdtBalance)));
  }, [mode, data, mpesa, methodId, usdtBalance]);
  useEffect(() => {
    const pending = data?.transactions.some((tx) => tx.status === 'under_review' || tx.status === 'processing') || mpesa?.transactions.some((tx) => tx.status === 'pending' || tx.status === 'processing');
    if (!pending) return;
    const timer = setInterval(() => { void refresh().catch(() => undefined); }, 8000);
    return () => clearInterval(timer);
  }, [data, mpesa, refresh]);

  const allMethods = data?.methods ?? [];
  const accountFundingEnabled = mode === 'deposit' ? data?.accountControls.depositsEnabled !== false : data?.accountControls.withdrawalsEnabled !== false;
  const availableMethods = allMethods.filter((method) => accountFundingEnabled && (mode === 'deposit' ? method.deposits_enabled : method.withdrawals_enabled));
  const selected = useMemo(() => availableMethods.find((method) => method.id === methodId) ?? null, [availableMethods, methodId]);
  const currency = selected?.asset ?? (mode === 'withdraw' && methodId === 'mpesa' && usdtBalance > 0 ? 'USDT' : 'KES');
  const walletBalance = (asset: string) => asset === 'KES'
    ? Number(mpesa?.balanceKes ?? 0)
    : Number(data?.wallets.find((wallet) => wallet.asset === asset)?.balance ?? 0);
  const amountNumber = Number(amount);
  const feePercent = mode === 'deposit' ? data?.depositFeePercent ?? 0 : data?.withdrawalFeePercent ?? 0;
  const feeAmount = Number.isFinite(amountNumber) && amountNumber > 0 ? amountNumber * feePercent / 100 : 0;
  const netAmount = Math.max(0, amountNumber - feeAmount);
  const kesPerUsdt = data?.kesPerUsdt ?? 130.05;
  const presets = currency === 'KES' ? [500, 1_000, 2_500, 5_000, 10_000, 25_000] : PRESETS;
  const mpesaChoice = { id: 'mpesa', name: 'M-Pesa', asset: 'KES', network: '', deposit_address: '', instructions: 'Pay securely using an M-Pesa prompt sent to your phone.', min_amount: 1, max_amount: 150000, provider: 'manual', enabled: accountFundingEnabled };
  const selectable = [mpesaChoice, ...availableMethods];
  const current = selectable.find((method) => method.id === methodId) ?? mpesaChoice;
  const configured = methodId === 'mpesa' || !!selected;
  const minimumAmount = methodId === 'mpesa'
    ? mode === 'deposit'
      ? Math.ceil((data?.minimumDepositUsdt ?? 10) * kesPerUsdt / Math.max(0.0001, 1 - feePercent / 100))
      : currency === 'USDT' ? data?.minimumWithdrawalUsdt ?? 1 : Math.ceil((data?.minimumWithdrawalUsdt ?? 1) * kesPerUsdt)
    : mode === 'deposit' ? Math.max(current.min_amount, data?.minimumDepositUsdt ?? 10) : data?.minimumWithdrawalUsdt ?? 1;
  const methodMaximum = methodId === 'mpesa' && mode === 'withdraw' && currency === 'USDT' ? 150000 / kesPerUsdt : current.max_amount;
  const maximumAmount = Math.min(methodMaximum, mode === 'withdraw' ? walletBalance(currency) : 1_000_000);

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || (currency === 'KES' && !Number.isSafeInteger(value))) { toast.error(currency === 'KES' ? 'Enter a whole KES amount' : 'Enter a valid amount'); return; }
    if (value < minimumAmount) { toast.error(`Minimum ${mode === 'deposit' ? 'deposit' : 'withdrawal'} is ${money(minimumAmount, currency)}`); return; }
    if (value > maximumAmount) { toast.error(`Maximum ${mode === 'deposit' ? 'deposit' : 'withdrawal'} is ${money(maximumAmount, currency)}`); return; }
    if (mode === 'withdraw' && value > walletBalance(currency)) { toast.error(`Amount exceeds your ${currency} wallet balance`); return; }
    setBusy(true);
    try {
      if (methodId === 'mpesa') {
        const result = mode === 'deposit'
          ? await initiateMpesaDeposit({ data: { amountKes: value } })
          : currency === 'USDT'
            ? await requestUsdtMpesaWithdrawal({ data: { amountUsdt: value } })
            : await requestMpesaWithdrawal({ data: { amountKes: value } });
        toast.success(result.message);
      } else if (selected) {
        if (mode === 'deposit') {
          await requestFundingDeposit({ data: { methodId: selected.id, amount: value, reference } });
          toast.success('Deposit submitted for review. Your balance will update after it is confirmed.');
          setReference('');
        } else {
          await requestFundingWithdrawal({ data: { methodId: selected.id, amount: value, destination: contact } });
          toast.success('Withdrawal request submitted for processing.');
        }
      }
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not submit request'); }
    finally { setBusy(false); }
  };

  if (!user) return <div className="pb-6"><PageHeader title={mode === 'deposit' ? 'Deposit' : 'Withdraw'} compact/><div className="mx-4 mt-5 rounded-2xl border border-border bg-card p-5">Sign in to manage your balance. <Link to="/auth" className="font-semibold text-primary underline">Sign in</Link></div></div>;
  if (!data || !mpesa) return <div className="pb-6"><PageHeader title={mode === 'deposit' ? 'Deposit' : 'Withdraw'} compact/><p className="p-6 text-sm text-muted-foreground">Loading your wallet…</p></div>;

  const hasActivated = mpesa.isActivated || data.isActivated;
  if (mode === 'withdraw' && !hasActivated) return <div className="pb-6"><PageHeader title="Account activation" compact/><section className="mx-4 mt-4 space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="grid grid-cols-3 text-center text-xs">{['Create an account','Make a deposit','Withdraw'].map((step,index)=><div key={step} className="border-b-2 border-primary pb-3"><span className="mx-auto grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">{index===0?<Check className="size-4"/>:index+1}</span><span className="mt-2 block">{step}</span></div>)}</div>
    <div className="mx-auto grid size-20 place-items-center rounded-2xl bg-emerald-600 text-white"><WalletCards className="size-10"/></div><div><h2 className="text-xl font-bold">Activate your account</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">To activate your account and access withdrawals, make at least one successful deposit. Choose a deposit method to get started.</p></div><Link to="/deposit" className="inline-flex h-14 w-full items-center justify-center rounded-full bg-primary px-5 text-base font-bold text-primary-foreground">Activate Account</Link>
  </section></div>;

  return <div className="pb-6"><PageHeader title={mode === 'deposit' ? 'Deposit' : 'Withdraw'} compact/><section className="mx-4 mt-4 space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
    <div><p className="text-sm text-muted-foreground">Account</p><div className="mt-2 flex min-h-[68px] items-center gap-3 rounded-[13px] border border-input bg-background px-4"><span className="grid size-10 place-items-center rounded-full bg-primary/10 text-lg">{currency==='KES'?'🇰🇪':currency==='USD'?'🇺🇸':'₮'}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{currency} Account</span><span className="mt-1 block text-xs text-muted-foreground">Available {money(walletBalance(currency),currency)}</span></span></div></div>
    <div><h2 className="text-lg font-bold">{mode === 'deposit' ? 'Deposit amount' : 'Withdrawal amount'}</h2><p className="mt-1 text-sm text-muted-foreground">{accountFundingEnabled ? 'Choose an amount and payment method.' : `Your account’s ${mode} option has been disabled by an administrator.`}</p></div>
    {mode === 'withdraw' && <div className="rounded-xl bg-muted/50 p-3 text-sm"><span className="text-muted-foreground">Available {currency} balance</span><span className="float-right font-bold">{money(walletBalance(currency), currency)}</span><span className="mt-2 block text-xs text-muted-foreground">USDT trading balance: <b className="text-foreground">{money(usdtBalance, 'USDT')}</b>{mpesa.balanceKes > 0 && <> · M-Pesa balance: <b className="text-foreground">{money(mpesa.balanceKes, 'KES')}</b></>}</span></div>}
    {selected && mode === 'deposit' && <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-semibold">Send {selected.asset} using {selected.name}{selected.network ? ` · ${selected.network}` : ''}</p><p className="text-xs leading-5 text-muted-foreground">{selected.instructions || 'Send only the selected asset on the network shown.'}</p><div className="break-all rounded-lg border border-border bg-background p-3 font-mono text-sm">{selected.deposit_address}</div><Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(selected.deposit_address); toast.success('Wallet address copied'); }}><Copy className="mr-2 size-4"/>Copy address</Button><p className="text-xs text-muted-foreground">After sending, enter the transaction hash below. Admin review is required before funds are credited.</p></div>}
    {methodId === 'mpesa' && <div className="rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{mode === 'deposit'
      ? `M-Pesa deposits convert to your trading wallet automatically at 1 USDT = ${kesPerUsdt.toFixed(2)} KES, after the deposit fee.`
      : currency === 'USDT'
        ? `Your USDT is converted automatically at 1 USDT = ${kesPerUsdt.toFixed(2)} KES and paid to this M-Pesa number after the withdrawal fee.`
        : 'Your existing KES balance is paid to this M-Pesa number.'} The payment or payout is confirmed through Safaricom.</div>}
    <label className="block text-sm font-semibold">Amount ({currency})<span className="mt-2 flex h-14 items-center rounded-xl border-2 border-primary bg-background px-4"><span className="mr-2 font-bold text-muted-foreground">{currency === 'KES' ? 'KES' : currency}</span><Input aria-label={`Amount in ${currency}`} className="h-full border-0 px-0 text-lg font-bold shadow-none focus-visible:ring-0" type="number" min={minimumAmount} max={maximumAmount} step={currency === 'KES' ? 1 : 'any'} value={amount} onChange={(event) => setAmount(event.target.value)}/></span></label>
    {amountNumber > 0 && <p className="-mt-3 text-xs leading-5 text-muted-foreground">{mode === 'deposit' && currency === 'KES'
      ? <>Fee {feePercent}% ({money(feeAmount, 'KES')}) · Estimated USDT wallet credit: <span className="font-semibold text-foreground">{money(netAmount / kesPerUsdt, 'USDT')}</span></>
      : mode === 'withdraw' && currency === 'USDT'
        ? <>Fee {feePercent}% · Estimated M-Pesa payout: <span className="font-semibold text-foreground">{money(Math.max(0, Math.round(amountNumber * kesPerUsdt) - Math.round(Math.round(amountNumber * kesPerUsdt) * feePercent / 100)), 'KES')}</span></>
        : <>Fee {feePercent}% ({money(feeAmount,currency)}) · {mode==='deposit'?'Estimated wallet credit':'Estimated payout'}: <span className="font-semibold text-foreground">{money(netAmount,currency)}</span></>}</p>}
    <div className="flex flex-wrap gap-2">{presets.filter((preset) => mode === 'deposit' || preset <= walletBalance(currency)).map((preset) => <button key={preset} type="button" onClick={() => setAmount(String(preset))} className={`rounded-lg border px-3 py-2 text-sm ${amountNumber===preset?'border-2 border-primary bg-primary/10':'border-border hover:bg-muted'}`}>{money(preset,currency)}</button>)}</div>
    <div className="space-y-2"><label className="text-sm font-medium" htmlFor="funding-method-select">Payment method</label><Select value={methodId} onValueChange={(id) => { const method = selectable.find((option) => option.id === id); if (!method) return; setMethodId(id); setAmount(id === 'mpesa' && mode === 'withdraw' && usdtBalance > 0 ? String(Math.min(50, usdtBalance)) : method.asset === 'KES' ? (mode === 'deposit' ? '1000' : '500') : '50'); setContact(''); setReference(''); }}><SelectTrigger id="funding-method-select" className="h-[68px] rounded-[13px] border-input bg-background px-4"><span className="flex min-w-0 items-center gap-3 text-left"><PlatformMark name={current.name}/><span className="min-w-0"><span className="block truncate text-sm font-semibold">{current.name}</span><span className="mt-1 block text-xs text-muted-foreground">{current.asset}{current.network ? ` · ${current.network}` : ''}</span></span></span></SelectTrigger><SelectContent position="popper" className="max-h-72">{selectable.map((method) => <SelectItem key={method.id} value={method.id} className="min-h-14 py-2 pl-2"><span className="flex min-w-0 items-center gap-3"><PlatformMark name={method.name}/><span className="min-w-0"><span className="block truncate font-semibold">{method.name}</span><span className="block truncate text-xs text-muted-foreground">{method.asset}{method.network ? ` · ${method.network}` : ''}</span></span></span></SelectItem>)}</SelectContent></Select></div>
    {methodId === 'mpesa' ? <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm"><span className="min-w-0"><span className="block text-xs text-muted-foreground">Registered M-Pesa number</span><b className="block truncate">{profile?.phone || 'No number saved'}</b></span><Link to="/profile" className="shrink-0 font-semibold text-primary underline">Edit in profile</Link></div> : mode === 'deposit' ? <label className="block text-sm font-semibold">Transaction hash / payment reference<Input className="mt-2 h-12 font-mono" placeholder="Paste transaction ID" value={reference} onChange={(event)=>setReference(event.target.value)}/></label> : <label className="block text-sm font-semibold">Your {currency} wallet address<Input className="mt-2 h-12 font-mono" placeholder="Enter your receiving wallet" value={contact} onChange={(event)=>setContact(event.target.value)}/></label>}
    <Button className="h-14 w-full rounded-full text-base font-bold" disabled={busy||!configured||!amount||!accountFundingEnabled||(methodId==='mpesa'&&!profile?.phone)} onClick={()=>void submit()}>{busy?'Please wait…':mode==='deposit'?'Deposit':'Withdraw'}<ArrowRight className="ml-2 size-5"/></Button>
    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><Clock3 className="size-3.5"/>{mode==='deposit'&&methodId!=='mpesa'?'Crypto deposits are credited after an admin confirms the transaction on-chain.':mode==='withdraw'&&methodId!=='mpesa'?'The selected amount is reserved while an admin processes the payout.':'Your balance updates when the M-Pesa transaction is confirmed.'}</p>
    <p className="text-center text-[11px] leading-5 text-muted-foreground">M-Pesa deposits are converted into your USDT trading balance automatically. You can withdraw that USDT to M-Pesa or use an enabled crypto withdrawal method.</p>
  </section></div>;
}

function PlatformMark({ name }: { name: string }) {
  const key = name.toLowerCase();
  const logo = key.includes('mpesa') || key.includes('m-pesa') ? '/payment-logos/mpesa.svg'
    : key.includes('binance') ? '/payment-logos/binance.svg'
    : key.includes('bybit') ? '/payment-logos/bybit.png'
    : key.includes('okx') ? '/payment-logos/okx.svg'
    : key.includes('usdt') || key.includes('tether') ? '/payment-logos/usdt.svg' : null;
  if (!logo) return <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">{name.slice(0, 2).toUpperCase()}</span>;
  const brandColor = key.includes('binance') ? '#f0b90b' : key.includes('usdt') || key.includes('tether') ? '#26a17b' : key.includes('okx') ? '#000' : '#fff';
  const symbolLogo = !key.includes('mpesa') && (key.includes('binance') || key.includes('okx') || key.includes('usdt') || key.includes('tether'));
  return <span aria-hidden className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border p-1" style={{ backgroundColor: symbolLogo ? brandColor : '#fff' }}><img src={logo} alt="" className={symbolLogo ? 'size-8 object-contain' : 'max-h-9 max-w-full object-contain'} style={symbolLogo ? { filter: 'brightness(0) invert(1)' } : undefined}/></span>;
}
