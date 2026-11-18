import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore } from '@/lib/store';
import { getRealTradingAdmin, setRealTradingReserveBalance } from '@/lib/real-trading.functions';

export function RealTradingAdmin() {
  const { user } = useStore();
  const read = useServerFn(getRealTradingAdmin);
  const setBalance = useServerFn(setRealTradingReserveBalance);
  const query = useQuery({ queryKey: ['real-trading-admin', user?.id], queryFn: () => read(), enabled: !!user, retry: false });
  const [balance, setBalanceInput] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await setBalance({ data: { total: Number(balance), note } });
      await query.refetch();
      setBalanceInput(''); setNote('');
      toast.success('Company payout reserve reconciled');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update reserve'); }
    finally { setBusy(false); }
  };
  const reserve = query.data?.reserve;
  const currentTotal = Number(reserve?.available ?? 0) + Number(reserve?.reserved_profit ?? 0);
  return <section className="space-y-4 rounded-xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Company payout reserve</h2><p className="mt-1 text-sm text-muted-foreground">Enter the verified company-owned USDT balance set aside for payouts. The system subtracts profit already locked for open trades and updates available funds. Customer deposits are liabilities and cannot be counted here.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Refresh payout reserve" onClick={() => void query.refetch()}><RefreshCw className="size-4"/></Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Available payout reserve</p><p className="mt-1 text-lg font-bold">{Number(reserve?.available ?? 0).toLocaleString()} USDT</p></div><div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Profit reserved for open trades</p><p className="mt-1 text-lg font-bold">{Number(reserve?.reserved_profit ?? 0).toLocaleString()} USDT</p></div><div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Customer stakes held for open trades</p><p className="mt-1 text-lg font-bold">{Number(reserve?.reserved_stakes ?? 0).toLocaleString()} USDT</p></div></div>
    <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1.5 text-xs font-semibold">Verified company payout balance (USDT)<Input type="number" min="0" step="0.00000001" value={balance} onChange={(event) => setBalanceInput(event.target.value)} placeholder={`Current total: ${currentTotal}`}/></label><label className="space-y-1.5 text-xs font-semibold sm:col-span-2">Reason / reconciliation reference<Input maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Where this company-owned balance was verified"/></label></div>
    <Button type="button" disabled={busy || !balance || !note.trim()} onClick={() => void save()}><Save className="mr-2 size-4"/>{busy ? 'Saving…' : 'Set verified company balance'}</Button>
    {!!query.data?.ledger.length && <div><h3 className="mb-2 font-semibold">Recent reserve ledger</h3><div className="divide-y divide-border border-y border-border">{query.data.ledger.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span>{entry.kind.replaceAll('_', ' ')} · {entry.note}</span><span className="font-semibold">{Number(entry.amount) > 0 ? '+' : ''}{Number(entry.amount).toLocaleString()} USDT</span></div>)}</div></div>}
  </section>;
}
