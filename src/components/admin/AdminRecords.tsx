import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Users, DollarSign, Search, X, UserRound, ShieldCheck, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { Json } from '@/integrations/supabase/types';

type Profile = { id: string; username: string; created_at: string; referral_code: string; email?: string | null; phone?: string; full_name?: string; status?: string };
type Wallet = { user_id: string; asset: string; balance: number };
type LiveTrade = { id: string; user_id: string; stake: number; payout: number | null; status: string; symbol?: string; direction?: string; created_at?: string };
type ClientControl = { user_id: string; agent_enabled: boolean; deposits_enabled: boolean; withdrawals_enabled: boolean };
type PracticeAccount = { user_id: string; state: Json };
export const formatMoney = (n: number) => `USD ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)}`;

export function AdminClients({ profiles, liveWallets = [], practiceAccounts = [], controls = [], trades = [], staff = [], showLiveBalances = false, search, onSearch, onControl }: { profiles: Profile[]; liveWallets?: Wallet[]; practiceAccounts?: PracticeAccount[]; controls?: ClientControl[]; trades?: LiveTrade[]; staff?: { user_id: string; role: string }[]; showLiveBalances?: boolean; search: string; onSearch: (value: string) => void; onControl?: (userId: string, field: 'agent_enabled' | 'deposits_enabled' | 'withdrawals_enabled', enabled: boolean) => void }) {
  const [selected, setSelected] = useState<Profile | null>(null);
  const [agentFilter, setAgentFilter] = useState(false);
  const controlByUser = useMemo(() => new Map(controls.map((control) => [control.user_id, control])), [controls]);
  const practiceByUser = useMemo(() => new Map(practiceAccounts.map((account) => [account.user_id, account.state as Record<string, unknown>])), [practiceAccounts]);
  const visibleProfiles = profiles.filter((profile) => {
    const match = `${profile.username} ${profile.full_name ?? ''} ${profile.email ?? ''} ${profile.id} ${profile.referral_code}`.toLowerCase().includes(search.toLowerCase());
    return match && (!agentFilter || controlByUser.get(profile.id)?.agent_enabled);
  });
  const balance = (userId: string, asset: string) => Number(liveWallets.find((wallet) => wallet.user_id === userId && wallet.asset === asset)?.balance ?? 0);
  const practiceBalance = (userId: string, asset: string) => {
    const state = practiceByUser.get(userId);
    const balances = state?.['balances'] as Record<string, unknown> | undefined;
    return Number(balances?.[asset] ?? 0);
  };
  const totals = (source: 'real' | 'demo', asset: string) => profiles.reduce((sum, profile) => sum + (source === 'real' ? balance(profile.id, asset) : practiceBalance(profile.id, asset)), 0);
  const recentTrades = (profile: Profile) => {
    const real = trades.filter((trade) => trade.user_id === profile.id).map((trade) => ({ id: trade.id, symbol: trade.symbol ?? 'Market', status: trade.status, stake: Number(trade.stake), payout: Number(trade.payout ?? 0), date: trade.created_at ?? '' }));
    const state = practiceByUser.get(profile.id);
    const demo = Array.isArray(state?.['trades']) ? (state['trades'] as Record<string, unknown>[]).map((trade, index) => ({ id: String(trade['id'] ?? index), symbol: String(trade['symbol'] ?? 'Practice market'), status: String(trade['status'] ?? 'recorded'), stake: Number(trade['stake'] ?? 0), payout: Number(trade['payout'] ?? 0), date: new Date(Number(trade['openedAt'] ?? 0)).toISOString() })) : [];
    return [...real, ...demo].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  };
  const accountMode = (profile: Profile) => practiceByUser.get(profile.id)?.['accountMode'] === 'real' ? 'REAL' : 'DEMO';
  const walletLine = (userId: string, source: 'real' | 'demo') => source === 'real'
    ? `USD ${balance(userId, 'USD').toLocaleString()} · USDT ${balance(userId, 'USDT').toLocaleString()}`
    : `USD ${practiceBalance(userId, 'USD').toLocaleString()} · USDT ${practiceBalance(userId, 'USDT').toLocaleString()}`;
  const selectedControl = selected ? controlByUser.get(selected.id) : undefined;

  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-3">
      {[{ label: 'Clients', value: profiles.length, icon: Users }, { label: 'Real balance', value: showLiveBalances ? `USD ${totals('real', 'USD').toLocaleString()} · USDT ${totals('real', 'USDT').toLocaleString()}` : 'Admin access only', icon: DollarSign }, { label: 'Demo balance', value: `USD ${totals('demo', 'USD').toLocaleString()} · USDT ${totals('demo', 'USDT').toLocaleString()}`, icon: DollarSign }].map(({ label, value, icon: Icon }) => <div key={label} className="admin-stat compact rounded-2xl border border-border bg-card"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="size-4" />{label}</div><div className="mt-1 truncate font-bold tabular">{value}</div></div>)}
    </div>
    <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search clients" placeholder="Search name, username or email…" value={search} onChange={e => onSearch(e.target.value)} className="h-11 rounded-xl pl-9" /></div>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant={!agentFilter ? 'secondary' : 'outline'} onClick={() => setAgentFilter(false)}>All clients</Button><Button size="sm" variant={agentFilter ? 'secondary' : 'outline'} onClick={() => setAgentFilter(true)}>Agents</Button></div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {!visibleProfiles.length && <p className="p-10 text-center text-sm text-muted-foreground">{profiles.length ? 'No clients match this filter.' : 'No registered clients yet.'}</p>}
      {visibleProfiles.map((profile) => {
        const control = controlByUser.get(profile.id);
        const isAgent = control?.agent_enabled ?? false;
        const mode = accountMode(profile);
        const staffRole = staff.find((member) => member.user_id === profile.id)?.role;
        return <article key={profile.id} className="border-b border-border p-3.5 last:border-0 sm:px-4">
          <div className="flex items-start gap-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(profile)}><p className="truncate font-semibold">{profile.full_name || profile.username || profile.id}</p><p className="mt-0.5 text-xs text-muted-foreground">Active: {mode} · joined {new Date(profile.created_at).toLocaleDateString()}</p></button><div className="flex items-center gap-2"><span className="hidden text-right text-xs font-bold text-success sm:block">{showLiveBalances ? formatMoney(balance(profile.id, 'USD')) : 'Restricted'}<span className="block text-primary">D {formatMoney(practiceBalance(profile.id, 'USD'))}</span></span><Button variant="ghost" size="icon" aria-label={`View ${profile.username} profile`} onClick={() => setSelected(profile)}><ChevronRight className="size-4"/></Button></div></div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5"><span className="admin-badge">{profile.status ?? 'ACTIVE'}</span><span className="admin-badge text-primary">↻ Real</span><span className="admin-badge text-primary">↻ Demo</span><Button size="sm" variant={isAgent ? 'secondary' : 'outline'} className="h-7 px-2 text-xs" disabled={!onControl} onClick={() => onControl?.(profile.id, 'agent_enabled', !isAgent)}><UserRound className="mr-1 size-3"/>{isAgent ? 'Agent ✓' : 'Agent'}</Button>{staffRole && <span className="admin-badge text-success"><ShieldCheck className="mr-1 size-3"/>{staffRole}</span>}<span className="ml-auto hidden text-[11px] text-muted-foreground md:inline">{walletLine(profile.id, 'real')}</span></div>
        </article>;
      })}
    </div>
    {selected && createPortal(<div className="fixed inset-0 z-[100] flex justify-end bg-black/35 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><aside role="dialog" aria-modal="true" aria-label={`${selected.full_name || selected.username} profile`} className="h-full w-full max-w-[700px] overflow-y-auto border-l border-border bg-background p-4 shadow-2xl sm:p-5"><header className="mb-4 flex items-start justify-between"><div><h2 className="font-bold">{selected.full_name || selected.username}</h2><p className="text-xs text-muted-foreground">Client profile and activity</p></div><Button variant="outline" size="icon" aria-label="Close profile" onClick={() => setSelected(null)}><X className="size-4"/></Button></header>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4"><h3 className="text-xs font-bold uppercase text-muted-foreground">Profile</h3>{[['Name', selected.full_name || selected.username], ['Username', selected.username], ['Email', selected.email || '—'], ['Phone', selected.phone || '—'], ['Active account', accountMode(selected).toLowerCase()], ['Account state', selected.status || 'ACTIVE'], ['Joined', new Date(selected.created_at).toLocaleString()], ['Referral code', selected.referral_code]].map(([label, value]) => <div key={label} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3"><span className="text-[11px] uppercase text-muted-foreground">{label}</span><span className="break-all text-right text-sm font-semibold">{value}</span></div>)}<div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-border bg-muted/40 p-3"><span className="text-[11px] uppercase text-muted-foreground">Real balance</span><p className="mt-1 font-bold">{showLiveBalances ? walletLine(selected.id, 'real') : 'Admin access only'}</p></div><div className="rounded-xl border border-border bg-muted/40 p-3"><span className="text-[11px] uppercase text-muted-foreground">Demo balance</span><p className="mt-1 font-bold">{walletLine(selected.id, 'demo')}</p></div></div></section>
      {onControl && <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4"><h3 className="text-xs font-bold uppercase text-muted-foreground">Agent access and funding</h3>{(['agent_enabled','deposits_enabled','withdrawals_enabled'] as const).map((field) => <div key={field} className="flex items-center justify-between gap-3"><span className="text-sm">{{agent_enabled:'Agent status',deposits_enabled:'Deposits',withdrawals_enabled:'Withdrawals'}[field]}</span><Switch checked={selectedControl?.[field] ?? (field !== 'agent_enabled')} onCheckedChange={(enabled) => onControl(selected.id, field, enabled)}/></div>)}<p className="text-xs text-muted-foreground">A disabled withdrawal is blocked without deducting the client’s balance.</p></section>}
      <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4"><h3 className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground"><History className="size-4"/>Recent trades</h3>{recentTrades(selected).length ? recentTrades(selected).map((trade) => <article key={trade.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div><p className="font-semibold">{trade.symbol}</p><p className="text-xs text-muted-foreground">Stake {trade.stake.toLocaleString()} · payout {trade.payout.toLocaleString()}</p></div><span className="text-xs capitalize">{trade.status}</span></article>) : <p className="text-sm text-muted-foreground">No recorded trades.</p>}</section>
    </aside></div>, document.body)}
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
