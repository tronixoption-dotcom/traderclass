import { useState } from 'react';
import { ChevronRight, Users, DollarSign, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AppState } from '@/lib/store';

type Profile = { id: string; username: string; created_at: string; referral_code: string };
export type PracticeAccount = { id: string; name: string; state: AppState; updated: string };
export const formatMoney = (n: number) => `USD ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)}`;

export function AdminClients({ profiles, accounts, search, onSearch }: { profiles: Profile[]; accounts: PracticeAccount[]; search: string; onSearch: (value: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const total = (key: 'USD' | 'USDT') => accounts.reduce((sum, a) => sum + (a.state.balances?.[key] ?? 0), 0);
  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-3">
      {[{ label: 'Clients', value: profiles.length, icon: Users }, { label: 'USD practice balance', value: formatMoney(total('USD')), icon: DollarSign }, { label: 'USDT practice balance', value: `${total('USDT').toLocaleString()} USDT`, icon: DollarSign }].map(({ label, value, icon: Icon }) => <div key={label} className="admin-stat compact"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="size-4" />{label}</div><div className="mt-1 font-bold tabular">{value}</div></div>)}
    </div>
    <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search clients" placeholder="Search name or username…" value={search} onChange={e => onSearch(e.target.value)} className="h-10 pl-9" /></div>
    <div className="py-1"><span className="admin-badge">All clients</span></div>
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {!profiles.length && <p className="p-10 text-center text-sm text-muted-foreground">No registered clients yet.</p>}
      {profiles.filter(p => `${p.username} ${p.id}`.toLowerCase().includes(search.toLowerCase())).map(p => {
        const a = accounts.find(a => a.id === p.id);
        const open = expanded === p.id;
        return <article key={p.id} className="border-b border-border last:border-0">
          <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-3 py-4 text-left" aria-expanded={open} onClick={() => setExpanded(open ? null : p.id)}>
            <div className="min-w-0"><p className="truncate text-base font-medium">{p.username}</p><p className="mt-0.5 text-xs font-normal text-muted-foreground">Practice account · joined {new Date(p.created_at).toLocaleDateString()}</p><div className="mt-3 flex flex-wrap gap-1.5"><span className="admin-badge">REGISTERED</span><span className="admin-badge">USD</span><span className="admin-badge">USDT</span></div></div>
            <div className="ml-3 flex shrink-0 items-center gap-4"><ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} /><div className="text-right text-xs"><p className="text-success">{formatMoney(a?.state.balances?.USD ?? 0)}</p><p className="mt-1 text-primary">{(a?.state.balances?.USDT ?? 0).toLocaleString()} USDT</p></div></div>
          </Button>
          {open && <dl className="grid gap-3 border-t border-border bg-muted/40 p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Client ID</dt><dd className="break-all">{p.id}</dd></div><div><dt className="text-xs text-muted-foreground">Referral code</dt><dd>{p.referral_code}</dd></div><div><dt className="text-xs text-muted-foreground">Recorded trades</dt><dd>{a?.state.trades?.length ?? 0}</dd></div><div><dt className="text-xs text-muted-foreground">Last saved</dt><dd>{a ? new Date(a.updated).toLocaleString() : 'No saved activity'}</dd></div></dl>}
        </article>;
      })}
      {!!profiles.length && !profiles.some(p => `${p.username} ${p.id}`.toLowerCase().includes(search.toLowerCase())) && <p className="p-10 text-center text-sm text-muted-foreground">No matching clients.</p>}
    </div>
  </div>;
}

export function AdminOverview({ accounts, treasury = false }: { accounts: PracticeAccount[]; treasury?: boolean }) {
  const transactions = accounts.flatMap(a => a.state.transactions ?? []);
  const trades = accounts.flatMap(a => a.state.trades ?? []);
  const deposits = transactions.filter(t => t.kind === 'topup').reduce((n, t) => n + t.amount, 0);
  const withdrawals = transactions.filter(t => t.kind === 'withdrawal').reduce((n, t) => n + t.amount, 0);
  const groups = treasury ? [{ title: 'Practice fund activity', stats: [{ label: 'Total deposits', value: formatMoney(deposits), tone: 'text-success' }, { label: 'Total withdrawn', value: formatMoney(withdrawals), tone: 'text-destructive' }, { label: 'Net practice funds', value: formatMoney(deposits - withdrawals), tone: 'text-primary' }, { label: 'Recorded transactions', value: transactions.length }] }] : [
    { title: 'Practice accounts', stats: [{ label: 'USD practice balance', value: formatMoney(accounts.reduce((n, a) => n + (a.state.balances?.USD ?? 0), 0)), tone: 'text-primary' }, { label: 'USDT practice balance', value: `${accounts.reduce((n, a) => n + (a.state.balances?.USDT ?? 0), 0).toLocaleString()} USDT` }, { label: 'Saved accounts', value: accounts.length }, { label: 'Account type', value: 'Practice only', tone: 'text-success' }] },
    { title: 'Trading activity', stats: [{ label: 'Total stakes', value: formatMoney(trades.reduce((n, t) => n + t.stake, 0)), tone: 'text-amber' }, { label: 'Recorded payouts', value: formatMoney(trades.reduce((n, t) => n + (t.payout ?? 0), 0)) }, { label: 'Recorded trades', value: trades.length }, { label: 'Open trades', value: trades.filter(t => t.status === 'active').length, tone: 'text-primary' }] },
    { title: 'Practice cash flow', stats: [{ label: 'Total deposits', value: formatMoney(deposits), tone: 'text-success' }, { label: 'Total withdrawn', value: formatMoney(withdrawals), tone: 'text-destructive' }, { label: 'Recorded transactions', value: transactions.length }] },
  ];
  return <div className="space-y-7">{groups.map(group => <section key={group.title}><h2 className="mb-3 text-sm font-bold uppercase text-muted-foreground">{group.title}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{group.stats.map(s => <div className="admin-stat" key={s.label}><p className="text-xs uppercase text-muted-foreground">{s.label}</p><p className={`mt-4 break-words text-2xl font-bold tabular ${s.tone ?? ''}`}>{s.value}</p></div>)}</div></section>)}</div>;
}