import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Check, Clock3, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loadMpesaWallet, initiateMpesaDeposit, requestMpesaWithdrawal } from '@/lib/mpesa.functions';
import { useStore } from '@/lib/store';

type WalletData = Awaited<ReturnType<typeof loadMpesaWallet>>;
const PRESETS = [500, 1_000, 2_500, 5_000, 10_000, 25_000];
const kes = (n: number | string) => `KES ${Number(n).toLocaleString('en-KE')}`;

export function MpesaWallet({ mode }: { mode: 'deposit' | 'withdraw' }) {
  const { user } = useStore();
  const [data, setData] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState('1000');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(async () => {
    if (!user) return;
    try { setData(await loadMpesaWallet()); } catch { /* Keep loading state until the authenticated query works. */ }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);
  useEffect(() => {
    if (!data?.transactions.some((tx) => tx.status === 'pending' || tx.status === 'processing')) return;
    const timer = setInterval(() => setRefreshKey((key) => key + 1), 8000);
    return () => clearInterval(timer);
  }, [data]);

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 1 || value > 150_000) { toast.error('Enter a whole KES amount from 1 to 150,000'); return; }
    if (mode === 'withdraw' && value > Number(data?.balanceKes ?? 0)) { toast.error('Amount is greater than your available KES balance'); return; }
    setBusy(true);
    try {
      const result = mode === 'deposit'
        ? await initiateMpesaDeposit({ data: { amountKes: value, phone } })
        : await requestMpesaWithdrawal({ data: { amountKes: value, phone } });
      toast.success(result.message);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'M-Pesa request failed');
    } finally { setBusy(false); }
  };

  if (!user) return <section className="rounded-2xl border border-border bg-card p-5 text-sm">Sign in to use your M-Pesa wallet. <Link to="/auth" className="font-semibold text-primary underline">Sign in</Link></section>;
  if (!data) return <section className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading your KES wallet…</section>;

  if (mode === 'withdraw' && !data.isActivated) {
    return <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="text-center"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"><ShieldCheck className="size-8"/></div><h2 className="mt-4 text-xl font-bold">Activate your account</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Make one successful deposit to activate withdrawals. It will appear in your KES wallet after the payment is confirmed.</p></div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] sm:text-xs">
        {[{ label: 'Create account', done: true }, { label: 'Make a deposit', done: false }, { label: 'Withdraw', done: false }].map((step, index) => <div key={step.label} className="rounded-xl border border-border bg-muted/40 p-3"><span className={`mx-auto grid size-7 place-items-center rounded-full ${step.done ? 'bg-primary text-primary-foreground' : 'border border-border bg-background text-muted-foreground'}`}>{step.done ? <Check className="size-4"/> : index + 1}</span><span className="mt-2 block font-medium">{step.label}</span></div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-4"><ArrowDownToLine className="size-5 text-primary"/><p className="mt-2 text-sm font-semibold">Deposit</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Make your first deposit to activate your account. Withdrawals then unlock after the payment is confirmed.</p></div><div className="rounded-xl border border-border p-4"><ArrowUpFromLine className="size-5 text-primary"/><p className="mt-2 text-sm font-semibold">Withdraw</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Withdrawals require available wallet funds and a confirmed first deposit.</p></div></div>
      <Link to="/deposit" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90">Make your first deposit <ArrowRight className="size-4"/></Link>
      <p className="text-center text-xs text-muted-foreground">Available KES balance: <span className="font-semibold text-foreground">{kes(data.balanceKes)}</span></p>
    </section>;
  }

  const isDeposit = mode === 'deposit';
  const balance = Number(data.balanceKes);
  const presets = isDeposit ? PRESETS : PRESETS.filter((value) => value <= balance);

  return <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isDeposit ? 'Deposit to your KES wallet' : 'Available to withdraw'}</p><h2 className="mt-1 text-2xl font-bold tabular-nums">{kes(balance)}</h2></div><Button variant="ghost" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>Refresh</Button></div>
    <div className="mt-5 space-y-4">
      <label className="block text-sm font-semibold">{isDeposit ? 'Deposit amount' : 'Withdrawal amount'}<span className="mt-2 flex h-14 items-center rounded-xl border-2 border-primary bg-background px-4 focus-within:ring-2 focus-within:ring-primary/15"><span className="mr-3 text-lg font-bold text-muted-foreground">KES</span><Input aria-label="Amount in KES" className="h-full border-0 px-0 text-lg font-bold shadow-none focus-visible:ring-0" type="number" inputMode="numeric" min="1" max={Math.min(150_000, isDeposit ? 150_000 : balance)} step="1" value={amount} onChange={(event) => setAmount(event.target.value)}/></span></label>
      {presets.length > 0 && <div className="flex flex-wrap gap-2">{presets.map((preset) => <button key={preset} type="button" onClick={() => setAmount(String(preset))} className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition ${Number(amount) === preset ? 'border-2 border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{kes(preset)}</button>)}</div>}
      {!isDeposit && balance > 0 && <button type="button" onClick={() => setAmount(String(balance))} className="text-xs font-semibold text-primary">Withdraw full available balance</button>}
      <label className="block text-sm font-semibold">{isDeposit ? 'Payment phone number' : 'Withdrawal phone number'}<Input className="mt-2 h-12" autoComplete="tel" inputMode="tel" placeholder="07XXXXXXXX" value={phone} onChange={(event) => setPhone(event.target.value)}/></label>
      <Button className="h-12 w-full rounded-xl text-sm font-bold" disabled={busy || (!isDeposit && balance <= 0)} onClick={() => void submit()}>{busy ? 'Please wait…' : isDeposit ? 'Deposit' : 'Withdraw'}<ArrowRight className="ml-2 size-4"/></Button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><Clock3 className="size-3.5"/>{isDeposit ? 'You’ll receive a secure M-Pesa prompt to confirm payment. Your wallet updates after confirmation.' : 'Your balance is reserved until the payout result is confirmed.'}</p>
    </div>
  </section>;
}
