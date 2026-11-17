import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { SiteSettings } from '@/lib/admin-rules';

type TradeRow = { status: string; stake: number; payout: number | null };

export function AdminSettingsPanel({ settings, setSettings, trades, audit, busy, onSave, onPaymentMethods }:{
  settings: SiteSettings;
  setSettings: (next: SiteSettings) => void;
  trades: TradeRow[];
  audit: { id: string; action: string; created_at: string }[];
  busy: boolean;
  onSave: () => void;
  onPaymentMethods: () => void;
}) {
  const settled = trades.filter((trade) => trade.status !== 'open');
  const totalStake = settled.reduce((sum, trade) => sum + Number(trade.stake), 0);
  const totalPayout = settled.reduce((sum, trade) => sum + Number(trade.payout ?? 0), 0);
  const roi = totalStake ? (totalPayout - totalStake) / totalStake * 100 : null;
  const rtp = totalStake ? totalPayout / totalStake * 100 : null;
  const winRate = settled.length ? settled.filter((trade) => trade.status === 'won').length / settled.length * 100 : null;
  const patchSettings = (patch: Partial<SiteSettings>) => setSettings({ ...settings, ...patch });
  const numberField = (key: 'real_min_stake' | 'real_max_stake' | 'real_daily_loss_cap' | 'real_weekly_loss_cap' | 'real_monthly_loss_cap' | 'real_market_exposure_cap' | 'real_user_exposure_cap', label: string, help?: string) => (
    <label className="space-y-2 text-sm font-medium" key={key}>{label}<Input type="number" min="0" step="any" value={settings[key]} onChange={(event) => patchSettings({ [key]: Number(event.target.value) || 0 })}/>{help && <span className="block text-xs font-normal text-muted-foreground">{help}</span>}</label>
  );
  return <form className="space-y-7" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Crypto deposits and withdrawals</h2><p className="mt-1 text-sm text-muted-foreground">Configure USDT network, wallet address, instructions, and per-method minimums in Payment methods.</p></div>
      <Button type="button" variant="outline" onClick={onPaymentMethods}>Manage wallet address, network and minimums</Button>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">Deposit fee (%)<Input type="number" min="0" max="20" step="0.01" value={settings.deposit_fee_percent} onChange={(event) => patchSettings({ deposit_fee_percent: Number(event.target.value) || 0 })}/></label>
        <label className="space-y-2 text-sm font-medium">Withdrawal fee (%)<Input type="number" min="0" max="20" step="0.01" value={settings.withdrawal_fee_percent} onChange={(event) => patchSettings({ withdrawal_fee_percent: Number(event.target.value) || 0 })}/></label>
      </div>
    </section>

    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Core economics</h2><p className="mt-1 text-sm text-muted-foreground">These are observed results from up to 500 recent settled real trades. They are reporting metrics, not outcome controls.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Observed RTP" value={rtp} suffix="%"/>
        <Metric label="Observed house edge" value={roi === null ? null : -roi} suffix="%"/>
        <Metric label="Observed player ROI" value={roi} suffix="%"/>
        <Metric label="Observed win rate" value={winRate} suffix="%"/>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">No win-rate target or RTP override is applied. Trades settle from external OKX prices, so changing a target to alter results would make outcomes misleading.</p>
    </section>

    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Limits and liability</h2><p className="mt-1 text-sm text-muted-foreground">Limits are enforced by the database when a real trade opens. Use 0 to leave an optional cap disabled. All amounts are USDT.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {numberField('real_min_stake', 'Minimum stake')}{numberField('real_max_stake', 'Maximum stake')}
        {numberField('real_market_exposure_cap', 'Open exposure per market', 'Maximum combined stake on open trades for one market.')}
        {numberField('real_user_exposure_cap', 'Open exposure per user', 'Maximum combined stake across a user’s open trades.')}
        {numberField('real_daily_loss_cap', 'Daily loss cap', 'Includes settled net losses and open stake exposure; resets at 00:00 UTC.')}
        {numberField('real_weekly_loss_cap', 'Weekly loss cap', 'Resets Monday at 00:00 UTC.')}
        {numberField('real_monthly_loss_cap', 'Monthly loss cap', 'Resets at the start of each UTC month.')}
      </div>
    </section>

    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Fraud and rate protection</h2><p className="mt-1 text-sm text-muted-foreground">An automated order-rate rule blocks repeated rapid trade submissions per account.</p></div>
      <label className="flex items-center justify-between gap-4 text-sm font-medium">Enable automated trade-rate protection<Switch aria-label="Enable automated trade-rate protection" checked={settings.fraud_detection_enabled} onCheckedChange={(checked) => patchSettings({ fraud_detection_enabled: checked })}/></label>
      <label className="block max-w-sm space-y-2 text-sm font-medium">Maximum trades per account per minute<Input type="number" min="1" max="60" step="1" value={settings.fraud_max_trades_per_minute} onChange={(event) => patchSettings({ fraud_max_trades_per_minute: Math.min(60, Math.max(1, Math.floor(Number(event.target.value) || 1))) })}/></label>
    </section>

    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Market and site controls</h2><p className="mt-1 text-sm text-muted-foreground">Real trades use OKX prices and fixed settlement rules; simulated volatility models are not used.</p></div>
      <div className="divide-y divide-border border-y border-border">{([
        { key: 'trading_enabled', label: 'Manual trading' }, { key: 'robot_enabled', label: 'Automated robot' },
        { key: 'deposits_enabled', label: 'All deposits' }, { key: 'withdrawals_enabled', label: 'All withdrawals' },
        { key: 'real_trading_enabled', label: 'Real USDT contracts (OKX prices)' },
      ] as const).map((item) => <label key={item.key} className="flex items-center justify-between py-4 text-sm font-medium">{item.label}<Switch aria-label={item.label} checked={settings[item.key]} onCheckedChange={(checked) => patchSettings({ [item.key]: checked })}/></label>)}</div>
      <label className="block space-y-2 text-sm font-medium">Site announcement<Textarea aria-label="Site announcement" maxLength={240} value={settings.announcement} onChange={(event) => patchSettings({ announcement: event.target.value })}/></label>
    </section>

    <Button disabled={busy}><Save/>{busy ? 'Saving…' : 'Save settings'}</Button>
    <section className="pt-4"><h2 className="mb-3 font-semibold">Recent admin activity</h2>{audit.length ? audit.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-3 text-sm"><span>{item.action}</span><span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></div>) : <p className="text-sm text-muted-foreground">No changes recorded.</p>}</section>
  </form>;
}

function Metric({ label, value, suffix }:{label:string;value:number|null;suffix:string}) {
  return <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 tabular text-lg font-semibold">{value === null ? 'No settled trades' : `${value.toFixed(2)}${suffix}`}</p></div>;
}
