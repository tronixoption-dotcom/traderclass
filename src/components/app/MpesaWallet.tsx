import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loadMpesaWallet, initiateMpesaDeposit, requestMpesaWithdrawal } from '@/lib/mpesa.functions';
import { useStore } from '@/lib/store';

type WalletData = Awaited<ReturnType<typeof loadMpesaWallet>>;
const kes = (n: number | string) => `KES ${Number(n).toLocaleString('en-KE')}`;

export function MpesaWallet() {
  const { user } = useStore();
  const [data, setData] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState('500');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(async () => {
    if (!user) return;
    try { setData(await loadMpesaWallet()); } catch { /* Show the sign-in or setup state below. */ }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);
  useEffect(() => {
    if (!data?.transactions.some((tx) => tx.status === 'pending' || tx.status === 'processing')) return;
    const timer = setInterval(() => setRefreshKey((key) => key + 1), 8000);
    return () => clearInterval(timer);
  }, [data]);

  const submit = async (kind: 'deposit' | 'withdrawal') => {
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 1 || value > 150_000) { toast.error('Enter a whole KES amount from 1 to 150,000'); return; }
    setBusy(true);
    try {
      const result = kind === 'deposit'
        ? await initiateMpesaDeposit({ data: { amountKes: value, phone } })
        : await requestMpesaWithdrawal({ data: { amountKes: value, phone } });
      toast.success(result.message);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'M-Pesa request failed');
    } finally { setBusy(false); }
  };

  return <section className="mb-6 rounded-2xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-semibold">M-Pesa wallet</h2><p className="mt-1 text-xs text-muted-foreground">Real KES funds. Separate from simulated USD/USDT practice balances.</p></div>
      <Button variant="ghost" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>Refresh</Button>
    </div>
    {!user ? <p className="mt-4 text-sm">Sign in to use your M-Pesa wallet. <Link to="/auth" className="text-primary underline">Sign in</Link></p> : <>
      <div className="mt-4 rounded-xl bg-muted p-3"><div className="text-xs text-muted-foreground">Available balance</div><div className="mt-1 text-xl font-bold tabular-nums">{kes(data?.balanceKes ?? 0)}</div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground">Amount in KES<Input inputMode="numeric" type="number" min="1" max="150000" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">M-Pesa phone number<Input autoComplete="tel" inputMode="tel" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>
      <div className="mt-3 flex gap-2"><Button className="flex-1" disabled={busy} onClick={() => void submit('deposit')}>Deposit with M-Pesa</Button><Button className="flex-1" variant="outline" disabled={busy} onClick={() => void submit('withdrawal')}>Withdraw to M-Pesa</Button></div>
      <div className="mt-5"><h3 className="mb-2 text-sm font-semibold">Recent M-Pesa activity</h3>{!data?.transactions.length ? <p className="text-xs text-muted-foreground">No M-Pesa transactions yet.</p> : <div className="divide-y divide-border">{data.transactions.map((tx) => <div key={tx.id} className="flex items-center justify-between gap-2 py-2 text-xs"><div><span className="font-medium capitalize">{tx.kind}</span><span className="ml-2 text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</span></div><div className="text-right"><div className="font-semibold tabular-nums">{kes(tx.amount_kes)}</div><div className="capitalize text-muted-foreground">{tx.status}{tx.mpesa_receipt_number ? ` · ${tx.mpesa_receipt_number}` : ''}</div></div></div>)}</div>}</div>
    </>}
  </section>;
}
