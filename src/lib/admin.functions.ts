import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { saveUnlock, clearUnlock, passwordMatches, requireStaff, staffRoles } from './admin-session.server';
import { DEFAULT_SETTINGS } from './admin-rules';
const roleSchema=z.enum(['admin','agent','support']);
export const unlockAdmin=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({password:z.string().max(256)}).parse(d)).handler(async({data,context})=>{
  const roles=await staffRoles(context.supabase,context.userId);
  if(!roles.length) return {ok:false,error:'This account does not have staff access.'};
  const expected=process.env['ADMIN_PANEL_PASSWORD'] ?? process.env['ADMIN_SETUP_PASSWORD'];
  if(!expected) return {ok:false,error:'Admin password has not been configured.'};
  if(!passwordMatches(data.password,expected)) {await new Promise(resolve=>setTimeout(resolve,1000));return {ok:false,error:'Incorrect password.'};}
  await saveUnlock(context.userId,context.claims);return {ok:true,error:''};
});
export const lockAdmin=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{await clearUnlock(context.userId,context.claims);return {ok:true};});
export const getAdminData=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {supabase,userId}=context;const roles=await requireStaff(supabase,userId,context.claims);const admin=roles.includes('admin');const agent=admin||roles.includes('agent');const support=admin||roles.includes('support');
  const check=<T,>(r:{data:T|null;error:unknown})=>{if(r.error)throw new Error('Could not load admin records');return r.data;};
  const profiles=agent?check(await supabase.from('profiles').select('id,username,referral_code,created_at').order('created_at',{ascending:false})):[];
  const liveTrades=agent?check(await supabase.from('real_trades').select('*').order('created_at',{ascending:false}).limit(500)):[];
  const liveWallets=admin?check(await supabase.from('funding_wallets').select('user_id,asset,balance')):[];
  const tickets=support?check(await supabase.from('support_tickets').select('*').order('created_at',{ascending:false})):[];
  const team=admin?check(await supabase.from('user_roles').select('*')):[];
  const invitations=admin?check(await supabase.from('staff_invitations').select('*')):[];
  const audit=admin?check(await supabase.from('admin_audit').select('*').order('created_at',{ascending:false}).limit(30)):[];
  const settings=check(await supabase.from('site_settings').select('*').maybeSingle())??DEFAULT_SETTINGS;
  return {roles,userId,profiles:profiles??[],liveTrades:liveTrades??[],liveWallets:liveWallets??[],tickets:tickets??[],team:team??[],invitations:invitations??[],audit:audit??[],settings};
});
export const saveAdminSettings=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({trading_enabled:z.boolean(),robot_enabled:z.boolean(),deposits_enabled:z.boolean(),withdrawals_enabled:z.boolean(),real_trading_enabled:z.boolean(),real_min_stake:z.number().positive().max(100000),real_max_stake:z.number().positive().max(100000),deposit_fee_percent:z.number().min(0).max(20),withdrawal_fee_percent:z.number().min(0).max(20),announcement:z.string().trim().max(240)}).refine(v=>v.real_max_stake>=v.real_min_stake,'Maximum real stake must be at least the minimum').parse(d)).handler(async({data,context})=>{
  await requireStaff(context.supabase,context.userId,context.claims,true);
  const {error}=await context.supabase.from('site_settings').upsert({id:true,...data,updated_at:new Date().toISOString()});if(error)throw new Error('Settings could not be saved');
  await context.supabase.from('admin_audit').insert({actor_id:context.userId,action:'Updated Tradeclass trading and funding settings'});return {ok:true};
});
export const manageTeam=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.discriminatedUnion('action',[
 z.object({action:z.literal('invite'),email:z.string().trim().email(),role:roleSchema}),z.object({action:z.literal('role'),userId:z.string().uuid(),role:roleSchema}),z.object({action:z.literal('revoke'),userId:z.string().uuid()}),z.object({action:z.literal('cancel'),email:z.string().email()})]).parse(d)).handler(async({data,context})=>{
 await requireStaff(context.supabase,context.userId,context.claims,true);let error;
 if(data.action==='invite')({error}=await context.supabase.from('staff_invitations').upsert({email:data.email.toLowerCase(),role:data.role,invited_by:context.userId}));
 else if(data.action==='role')({error}=await context.supabase.rpc('set_staff_role',{target_user:data.userId,new_role:data.role}));
 else if(data.action==='revoke')({error}=await context.supabase.rpc('revoke_staff',{target_user:data.userId}));
 else ({error}=await context.supabase.from('staff_invitations').delete().eq('email',data.email));
 if(error)throw new Error('Team change could not be saved. You cannot change your own role.');
 await context.supabase.from('admin_audit').insert({actor_id:context.userId,action:`Team ${data.action}`});return {ok:true};
});
export const replyTicket=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid(),reply:z.string().trim().min(1).max(4000),status:z.enum(['open','resolved'])}).parse(d)).handler(async({data,context})=>{
 const roles=await requireStaff(context.supabase,context.userId,context.claims);if(!roles.includes('admin')&&!roles.includes('support'))throw new Error('Support permission required');
 const {error}=await context.supabase.from('support_tickets').update({reply:data.reply,status:data.status}).eq('id',data.id);if(error)throw new Error('Reply could not be saved');return {ok:true};
});
