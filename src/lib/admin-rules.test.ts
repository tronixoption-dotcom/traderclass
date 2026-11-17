import { describe, expect, it } from 'vitest';
import { entryClick, canAccess, DEFAULT_SETTINGS, actionAllowed, validAdminUnlock } from './admin-rules';
describe('admin rules', () => {
  it('unlock is bound to the verified user and sign-in session',()=>{
    const row={user_id:'owner',session_id:'session-a',expires_at:'2026-11-16T13:00:00Z'};
    const now=Date.parse('2026-11-16T12:00:00Z');
    expect(validAdminUnlock(row,'owner','session-a',now)).toBe(true);
    expect(validAdminUnlock(row,'other','session-a',now)).toBe(false);
    expect(validAdminUnlock(row,'owner','session-b',now)).toBe(false);
  });
  it('expired or missing unlock cannot grant access',()=>{
    const now=Date.parse('2026-11-16T13:00:00Z');
    expect(validAdminUnlock({user_id:'owner',session_id:'session-a',expires_at:'2026-11-16T13:00:00Z'},'owner','session-a',now)).toBe(false);
    expect(validAdminUnlock(null,'owner','session-a',now)).toBe(false);
  });
  it('opens only on the seventh logo click', () => { let count=0; for(let i=0;i<6;i++){const next=entryClick(count);expect(next.open).toBe(false);count=next.count;}expect(entryClick(count)).toEqual({count:0,open:true}); });
  it('admins can manage teams and settings', () => { expect(canAccess(['admin'],'Teams')).toBe(true);expect(canAccess(['admin'],'Settings')).toBe(true); });
  it('agents can manage client and funding queues, but not settings or support', () => {expect(canAccess(['agent'],'Clients')).toBe(true);expect(canAccess(['agent'],'Settings')).toBe(false);expect(canAccess(['agent'],'Deposits')).toBe(true);expect(canAccess(['agent'],'Withdrawals')).toBe(true);expect(canAccess(['agent'],'Support')).toBe(false);});
  it('support only accesses support', () => {expect(canAccess(['support'],'Support')).toBe(true);expect(canAccess(['support'],'Clients')).toBe(false);});
  it('disabling trading blocks manual and robot trades',()=>{const s={...DEFAULT_SETTINGS,trading_enabled:false};expect(actionAllowed(s,'trade')).toBe(false);expect(actionAllowed(s,'robot')).toBe(false);});
  it('disabling robot preserves manual trading',()=>{const s={...DEFAULT_SETTINGS,robot_enabled:false};expect(actionAllowed(s,'robot')).toBe(false);expect(actionAllowed(s,'trade')).toBe(true);});
  it('practice deposits and withdrawals have independent switches',()=>{expect(actionAllowed({...DEFAULT_SETTINGS,deposits_enabled:false},'deposit')).toBe(false);expect(actionAllowed({...DEFAULT_SETTINGS,withdrawals_enabled:false},'withdrawal')).toBe(false);});
});
