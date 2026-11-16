import { setResponseHeader } from '@tanstack/react-start/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { validAdminUnlock, type StaffRole } from './admin-rules';
export function verifiedSessionId(claims: Record<string, unknown>) {
  const id = claims['session_id'];
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Please sign in again');
  setResponseHeader('Cache-Control', 'no-store');
  return id;
}
export async function saveUnlock(userId: string, claims: Record<string, unknown>) {
  const sessionId = verifiedSessionId(claims);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('admin_session_unlocks').upsert({session_id:sessionId,user_id:userId,expires_at:new Date(Date.now()+3600000).toISOString()});
  if(error) throw new Error('Unable to save admin unlock');
}
export async function clearUnlock(userId: string, claims: Record<string, unknown>) {
  const sessionId = verifiedSessionId(claims);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const {error}=await supabaseAdmin.from('admin_session_unlocks').delete().eq('session_id',sessionId).eq('user_id',userId);
  if(error) throw new Error('Unable to lock admin access');
}
export function passwordMatches(input:string,expected:string){return timingSafeEqual(createHash('sha256').update(input).digest(),createHash('sha256').update(expected).digest());}
export async function staffRoles(client:SupabaseClient<Database>,userId:string){
  const {error:redeem}=await client.rpc('redeem_staff_invitation'); if(redeem) throw new Error('Unable to check staff access');
  const {data,error}=await client.from('user_roles').select('role').eq('user_id',userId);
  if(error) throw new Error('Unable to check staff access');
  return (data??[]).map(r=>r.role) as StaffRole[];
}
export async function requireStaff(client:SupabaseClient<Database>,userId:string,claims:Record<string,unknown>,adminOnly=false){
  const roles=await staffRoles(client,userId);
  if(!roles.length || (adminOnly&&!roles.includes('admin'))) throw new Error('Admin access required');
  const sessionId=verifiedSessionId(claims);
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data,error}=await supabaseAdmin.from('admin_session_unlocks').select('session_id,user_id,expires_at').eq('session_id',sessionId).eq('user_id',userId).maybeSingle();
  if(error || !validAdminUnlock(data,userId,sessionId,Date.now())) throw new Error('Admin access required');
  return roles;
}
