import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { SiteSettings } from '@/lib/admin-rules';

export function AdminSettingsPanel({ settings, setSettings, audit, busy, onSave, onPaymentMethods }:{
  settings: SiteSettings;
  setSettings: (next: SiteSettings) => void;
  audit: { id: string; action: string; created_at: string }[];
  busy: boolean;
  onSave: () => void;
  onPaymentMethods: () => void;
}) {
  const patchSettings = (patch: Partial<SiteSettings>) => setSettings({ ...settings, ...patch });
  const userRealMultiplier = settings.user_real_win_rate_percent <= 0 ? 1 : Math.max(1, settings.real_rtp_target_percent / settings.user_real_win_rate_percent);
  const agentRealMultiplier = settings.agent_real_win_rate_percent <= 0 ? 1 : Math.max(1, settings.real_rtp_target_percent / settings.agent_real_win_rate_percent);
  const pricingIsValid = [settings.user_real_win_rate_percent, settings.agent_real_win_rate_percent].every((rate) => rate === 0 || rate === 100 || settings.real_rtp_target_percent > rate);
  const winRateFields = [
    ['user_demo_win_rate_percent', 'Normal user demo win rate'],
    ['user_real_win_rate_percent', 'Normal user real win rate'],
    ['agent_demo_win_rate_percent', 'Agent demo win rate'],
    ['agent_real_win_rate_percent', 'Agent real win rate'],
  ] as const;
  const numberField = (key: 'real_min_stake' | 'real_max_stake' | 'real_daily_loss_cap' | 'real_weekly_loss_cap' | 'real_monthly_loss_cap' | 'real_market_exposure_cap' | 'real_user_exposure_cap', label: string, help?: string) => (
    <label className="space-y-2 text-sm font-medium" key={key}>{label}<Input type="number" min="0" step="any" value={settings[key]} onChange={(event) => patchSettings({ [key]: Number(event.target.value) || 0 })}/>{help && <span className="block text-xs font-normal text-muted-foreground">{help}</span>}</label>
  );
  return <form className="space-y-7" onSubmit={(event) => { event.preventDefault(); if (pricingIsValid) onSave(); }}>
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Crypto deposits and withdrawals</h2><p className="mt-1 text-sm text-muted-foreground">Set global USDT minimums here. Configure each receiving wallet, network, and any higher per-method minimum in Payment methods.</p></div>
      <Button type="button" variant="outline" onClick={onPaymentMethods}>Manage wallets and per-method minimums</Button>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">Deposit fee (%)<Input type="number" min="0" max="99.99" step="0.01" value={settings.deposit_fee_percent} onChange={(event) => patchSettings({ deposit_fee_percent: Number(event.target.value) || 0 })}/></label>
        <label className="space-y-2 text-sm font-medium">Withdrawal fee (%)<Input type="number" min="0" max="99.99" step="0.01" value={settings.withdrawal_fee_percent} onChange={(event) => patchSettings({ withdrawal_fee_percent: Number(event.target.value) || 0 })}/></label>
        <label className="space-y-2 text-sm font-medium">Minimum deposit (USDT)<Input type="number" min="10" max="1000000" step="any" value={settings.minimum_deposit_usdt} onChange={(event) => patchSettings({ minimum_deposit_usdt: Math.max(10, Number(event.target.value) || 10) })}/><span className="block text-xs font-normal text-muted-foreground">Applies to all crypto deposits and M-Pesa deposits after conversion. Per-method minimums can be higher.</span></label>
        <label className="space-y-2 text-sm font-medium">Minimum withdrawal (USDT)<Input type="number" min="0.00000001" max="1000000" step="any" value={settings.minimum_withdrawal_usdt} onChange={(event) => patchSettings({ minimum_withdrawal_usdt: Math.max(0.00000001, Number(event.target.value) || 0.00000001) })}/><span className="block text-xs font-normal text-muted-foreground">Applies to crypto withdrawals and USDT withdrawals to M-Pesa.</span></label>
        <label className="space-y-2 text-sm font-medium">M-Pesa conversion rate (KES per 1 USDT)<Input type="number" min="1" max="10000" step="0.01" value={settings.kes_per_usdt} onChange={(event) => patchSettings({ kes_per_usdt: Math.min(10000, Math.max(1, Number(event.target.value) || 1)) })}/><span className="block text-xs font-normal text-muted-foreground">Used for new M-Pesa deposits and USDT withdrawals to M-Pesa. The rate is saved with each transaction.</span></label>
      </div>
    </section>

    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Core economics</h2><p className="mt-1 text-sm text-muted-foreground">RTP sets real-trade payout size. The four win-rate controls determine outcomes separately for normal users and agents across demo and real accounts.</p></div>
      <label className="block max-w-sm space-y-2 text-sm font-medium">Pricing model preset<Select value={settings.real_pricing_model} onValueChange={(value) => {
        if (value === 'standard') patchSettings({ real_pricing_model: 'standard', real_rtp_target_percent: 95, real_win_rate_target_percent: 55.8824, user_real_win_rate_percent: 55.8824, agent_real_win_rate_percent: 55.8824 });
        else if (value === 'conservative') patchSettings({ real_pricing_model: 'conservative', real_rtp_target_percent: 90, real_win_rate_target_percent: 55.8824, user_real_win_rate_percent: 55.8824, agent_real_win_rate_percent: 55.8824 });
        else if (value === 'aggressive') patchSettings({ real_pricing_model: 'aggressive', real_rtp_target_percent: 98, real_win_rate_target_percent: 55.8824, user_real_win_rate_percent: 55.8824, agent_real_win_rate_percent: 55.8824 });
        else patchSettings({ real_pricing_model: 'custom' });
      }}><SelectTrigger aria-label="Pricing model preset"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="conservative">Conservative</SelectItem><SelectItem value="aggressive">Aggressive</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">Target RTP (%)<Input type="number" min="0.00000001" step="any" value={settings.real_rtp_target_percent} onChange={(event) => patchSettings({ real_pricing_model: 'custom', real_rtp_target_percent: Number(event.target.value) || 0 })}/><span className="block text-xs font-normal text-muted-foreground">Sets the payout size for winning real trades.</span></label>
        <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">{winRateFields.map(([key, label]) => <label key={key} className="space-y-2 text-sm font-medium">{label} (%)<Input type="number" min="0" max="100" step="0.01" value={settings[key]} onChange={(event) => patchSettings({ [key]: Number(event.target.value) || 0 })}/><span className="block text-xs font-normal text-muted-foreground">0% guarantees losses; 100% guarantees wins. Values between them set the win chance for each new trade.</span></label>)}</div>
      </div>
      {!pricingIsValid && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">For real win rates between 1% and 99%, RTP must be higher than both real win rates so a winning payout exceeds the stake.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="RTP target" value={settings.real_rtp_target_percent} suffix="%"/>
        <Metric label="Normal user real win payout" value={userRealMultiplier} suffix="x"/>
        <Metric label="Agent real win payout" value={agentRealMultiplier} suffix="x"/>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Win-rate settings apply to each new demo or real trade. Market prices are still recorded, but the configured result rate determines whether a trade wins or loses. The RTP target sets payout size for real account wins.</p>
    </section>

    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Limits and liability</h2><p className="mt-1 text-sm text-muted-foreground">Limits are enforced by the database when a real trade opens. Use 0 to leave an optional cap disabled. All amounts are USDT.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {numberField('real_min_stake', 'Minimum stake')}{numberField('real_max_stake', 'Maximum stake (0 = no maximum)', 'Set to 0 for no platform-set maximum; available wallet balance still applies.')}
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
      <label className="block max-w-sm space-y-2 text-sm font-medium">Maximum trades per account per minute<Input type="number" min="1" max="32767" step="1" value={settings.fraud_max_trades_per_minute} onChange={(event) => patchSettings({ fraud_max_trades_per_minute: Math.min(32767, Math.max(1, Math.floor(Number(event.target.value) || 1))) })}/></label>
    </section>

    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div><h2 className="text-lg font-semibold">Market and site controls</h2><p className="mt-1 text-sm text-muted-foreground">Live contracts use fresh OKX prices and the configured payout rules.</p></div>
      <div className="divide-y divide-border border-y border-border">{([
        { key: 'trading_enabled', label: 'Manual trading' }, { key: 'robot_enabled', label: 'Automated robot' },
        { key: 'deposits_enabled', label: 'All deposits' }, { key: 'withdrawals_enabled', label: 'All withdrawals' },
        { key: 'real_trading_enabled', label: 'Live USDT contracts (OKX prices)' },
      ] as const).map((item) => <label key={item.key} className="flex items-center justify-between py-4 text-sm font-medium">{item.label}<Switch aria-label={item.label} checked={settings[item.key]} onCheckedChange={(checked) => patchSettings({ [item.key]: checked })}/></label>)}</div>
      <label className="block space-y-2 text-sm font-medium">Site announcement<Textarea aria-label="Site announcement" maxLength={240} value={settings.announcement} onChange={(event) => patchSettings({ announcement: event.target.value })}/></label>
    </section>

    <Button disabled={busy || !pricingIsValid}><Save/>{busy ? 'Saving…' : 'Save settings'}</Button>
    <section className="pt-4"><h2 className="mb-3 font-semibold">Recent admin activity</h2>{audit.length ? audit.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-3 text-sm"><span>{item.action}</span><span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></div>) : <p className="text-sm text-muted-foreground">No changes recorded.</p>}</section>
  </form>;
}

function Metric({ label, value, suffix }:{label:string;value:number;suffix:string}) {
  return <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 tabular text-lg font-semibold">{`${value.toFixed(2)}${suffix}`}</p></div>;
}
