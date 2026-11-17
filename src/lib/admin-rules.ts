export const ADMIN_ENTRY_CLICKS = 7;
export type StaffRole = 'admin' | 'agent' | 'support';
export function validAdminUnlock(row: {session_id:string;user_id:string;expires_at:string}|null, userId:string, sessionId:string, now:number) {
  return !!row && row.user_id===userId && row.session_id===sessionId && Date.parse(row.expires_at)>now;
}
export const DEFAULT_SETTINGS = { trading_enabled: true, robot_enabled: true, deposits_enabled: true, withdrawals_enabled: true, real_trading_enabled: false, real_min_stake: 1, real_max_stake: 100, deposit_fee_percent: 0, withdrawal_fee_percent: 0, announcement: '' };
export type SiteSettings = typeof DEFAULT_SETTINGS;
export function canAccess(roles: StaffRole[], area: string) {
  if (roles.includes('admin')) return true;
  if (roles.includes('agent')) return ['Clients','Deposits','Withdrawals','Trades'].includes(area);
  return roles.includes('support') && area === 'Support';
}
export function entryClick(count: number) { return count + 1 >= ADMIN_ENTRY_CLICKS ? { count: 0, open: true } : { count: count + 1, open: false }; }
export function actionAllowed(settings: SiteSettings, action: 'trade' | 'robot' | 'deposit' | 'withdrawal') {
  return { trade: settings.trading_enabled, robot: settings.trading_enabled && settings.robot_enabled, deposit: settings.deposits_enabled, withdrawal: settings.withdrawals_enabled }[action];
}
