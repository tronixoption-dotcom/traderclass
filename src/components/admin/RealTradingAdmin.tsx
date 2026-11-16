import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore } from '@/lib/store';
import { adjustRealTradingReserve, getRealTradingAdmin } from '@/lib/real-trading.functions';

export function RealTradingAdmin() {
  const { user } = useStore();
  const read = useServerFn(getRealTradingAdmin);
  const adjust = useServerFn(adjustRealTradingReserve);
  const query = useQuery({ queryKey: ['real-trading-admin', user?.id], queryFn: () => read(), enabled: !!user, retry: false });
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await adjust({ data: { delta: Number(delta), note } });
      await query.refetch();
      setDelta(''); setNote('');
      toast.success('Payout reserve updated');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update reserve'); }
    finally { setBusy(false); }
  };
  const reserve = query.data?.reserve;
  return <section className="space-y-4 rounded-xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Real account payout reserve</h2><p className="mt-1 text-sm text-muted-foreground">Record verified business-owned USDT held in the site wallet. Customer deposits are liabilities and must not be counted as payout reserve. Real trades stay paused when the reserve cannot cover their maximum profit.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Refresh payout reserve" onClick={() => void query.refetch()}><RefreshCw className="size-4"/></Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Available payout reserve</p><p className="mt-1 text-lg font-bold">{Number(reserve?.available ?? 0).toLocaleString()} USDT</p></div><div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Profit reserved for open trades</p><p className="mt-1 text-lg font-bold">{Number(reserve?.reserved_profit ?? 0).toLocaleString()} USDT</p></div><div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Customer stakes held for open trades</p><p className="mt-1 text-lg font-bold">{Number(reserve?.reserved_stakes ?? 0).toLocaleString()} USDT</p></div></div>
    <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1.5 text-xs font-semibold">Reserve adjustment (+/- USDT)<Input type="number" step="any" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="e.g. 250"/></label><label className="space-y-1.5 text-xs font-semibold sm:col-span-2">Reason / reconciliation reference<Input maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Verified business reserve transfer reference"/></label></div>
    <Button type="button" disabled={busy || !delta || !note.trim()} onClick={() => void save()}><Save className="mr-2 size-4"/>{busy ? 'Saving…' : 'Record reserve adjustment'}</Button>
    {!!query.data?.ledger.length && <div><h3 className="mb-2 font-semibold">Recent reserve ledger</h3><div className="divide-y divide-border border-y border-border">{query.data.ledger.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span>{entry.kind.replaceAll('_', ' ')} · {entry.note}</span><span className="font-semibold">{Number(entry.amount) > 0 ? '+' : ''}{Number(entry.amount).toLocaleString()} USDT</span></div>)}</div></div>}
  </section>;
}
