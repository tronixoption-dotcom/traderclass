import { useState } from 'react';
import { ChevronRight, Users, DollarSign, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Profile = { id: string; username: string; created_at: string; referral_code: string };
type Wallet = { user_id: string; asset: string; balance: number };
type LiveTrade = { id: string; user_id: string; stake: number; payout: number | null; status: string };
export const formatMoney = (n: number) => `USD ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)}`;

export function AdminClients({ profiles, liveWallets = [], showLiveBalances = false, search, onSearch }: { profiles: Profile[]; liveWallets?: Wallet[]; showLiveBalances?: boolean; search: string; onSearch: (value: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const total = (asset: string) => liveWallets.filter((wallet) => wallet.asset === asset).reduce((sum, wallet) => sum + Number(wallet.balance), 0);
  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-3">
      {[{ label: 'Clients', value: profiles.length, icon: Users }, { label: 'Customer USD wallets', value: showLiveBalances ? formatMoney(total('USD')) : 'Admin access only', icon: DollarSign }, { label: 'Customer USDT wallets', value: showLiveBalances ? `${total('USDT').toLocaleString()} USDT` : 'Admin access only', icon: DollarSign }].map(({ label, value, icon: Icon }) => <div key={label} className="admin-stat compact"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="size-4" />{label}</div><div className="mt-1 font-bold tabular">{value}</div></div>)}
    </div>
    <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search clients" placeholder="Search name or username" value={search} onChange={e => onSearch(e.target.value)} className="h-10 pl-9" /></div>
    <div className="py-1"><span className="admin-badge">All clients</span></div>
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {!profiles.length && <p className="p-10 text-center text-sm text-muted-foreground">No registered clients yet.</p>}
      {profiles.filter(p => `${p.username} ${p.id}`.toLowerCase().includes(search.toLowerCase())).map(p => {
        const open = expanded === p.id;
        const wallet = (asset: string) => liveWallets.find((item) => item.user_id === p.id && item.asset === asset)?.balance ?? 0;
        return <article key={p.id} className="border-b border-border last:border-0">
          <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-3 py-4 text-left" aria-expanded={open} onClick={() => setExpanded(open ? null : p.id)}>
            <div className="min-w-0"><p className="truncate text-base font-medium">{p.username}</p><p className="mt-0.5 text-xs font-normal text-muted-foreground">Client profile · joined {new Date(p.created_at).toLocaleDateString()}</p><div className="mt-3 flex flex-wrap gap-1.5"><span className="admin-badge">REGISTERED</span><span className="admin-badge">FUNDED ACCOUNT</span></div></div>
            <div className="ml-3 flex shrink-0 items-center gap-4"><ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} /><div className="text-right text-xs"><p className="text-success">{showLiveBalances ? formatMoney(Number(wallet('USD'))) : 'Restricted'}</p><p className="mt-1 text-primary">{showLiveBalances ? `${Number(wallet('USDT')).toLocaleString()} USDT` : 'Restricted'}</p></div></div>
          </Button>
          {open && <dl className="grid gap-3 border-t border-border bg-muted/40 p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Client ID</dt><dd className="break-all">{p.id}</dd></div><div><dt className="text-xs text-muted-foreground">Referral code</dt><dd>{p.referral_code}</dd></div><div><dt className="text-xs text-muted-foreground">USD wallet</dt><dd>{showLiveBalances ? formatMoney(Number(wallet('USD'))) : 'Admin access only'}</dd></div><div><dt className="text-xs text-muted-foreground">USDT wallet</dt><dd>{showLiveBalances ? `${Number(wallet('USDT')).toLocaleString()} USDT` : 'Admin access only'}</dd></div></dl>}
        </article>;
      })}
      {!!profiles.length && !profiles.some(p => `${p.username} ${p.id}`.toLowerCase().includes(search.toLowerCase())) && <p className="p-10 text-center text-sm text-muted-foreground">No matching clients.</p>}
    </div>
  </div>;
}

export function AdminOverview({ wallets, trades }: { wallets: Wallet[]; trades: LiveTrade[] }) {
  const balance = (asset: string) => wallets.filter((wallet) => wallet.asset === asset).reduce((sum, wallet) => sum + Number(wallet.balance), 0);
  const stats = [
    { label: 'Customer USD balances', value: formatMoney(balance('USD')) },
    { label: 'Customer USDT balances', value: `${balance('USDT').toLocaleString()} USDT` },
    { label: 'Live trades', value: trades.length.toLocaleString() },
    { label: 'Open live trades', value: trades.filter((trade) => trade.status === 'open').length.toLocaleString() },
    { label: 'Total live stakes', value: `${trades.reduce((sum, trade) => sum + Number(trade.stake), 0).toLocaleString()} USDT` },
    { label: 'Recorded payouts', value: `${trades.reduce((sum, trade) => sum + Number(trade.payout ?? 0), 0).toLocaleString()} USDT` },
  ];
  return <section><h2 className="mb-3 text-sm font-bold uppercase text-muted-foreground">Live account overview</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{stats.map((stat) => <div className="admin-stat" key={stat.label}><p className="text-xs uppercase text-muted-foreground">{stat.label}</p><p className="mt-4 break-words text-2xl font-bold tabular">{stat.value}</p></div>)}</div></section>;
}
