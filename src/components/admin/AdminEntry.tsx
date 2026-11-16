import { useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useStore } from '@/lib/store';
import { entryClick } from '@/lib/admin-rules';
import { unlockAdmin } from '@/lib/admin.functions';
export function AdminEntry(){
 const cache=useQueryClient();const count=useRef(0);const [open,setOpen]=useState(false);const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const {user}=useStore();const unlock=useServerFn(unlockAdmin);const navigate=useNavigate();
 return <><Button variant="ghost" aria-label="TraderClass logo" className="size-[48px] shrink-0 overflow-hidden rounded-full bg-gold p-0 ring-2 ring-foreground/80 hover:bg-gold" onClick={()=>{const next=entryClick(count.current);count.current=next.count;if(next.open){setError('');setOpen(true);}}}><img src="/favicon.png" alt="" className="size-full object-cover"/></Button>
 <Dialog open={open} onOpenChange={(value)=>{setOpen(value);if(!value){setPassword('');setError('');}}}><DialogContent className="max-w-sm rounded-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><LockKeyhole className="size-5 text-gold"/>Staff access</DialogTitle><DialogDescription>Authorized team members only.</DialogDescription></DialogHeader>
 {!user?<div className="space-y-4"><p className="text-sm text-muted-foreground">Sign in with your staff account first.</p><Button asChild className="w-full"><Link to="/auth" onClick={()=>setOpen(false)}>Sign in</Link></Button></div>:<form className="space-y-4" onSubmit={async(e)=>{e.preventDefault();setBusy(true);setError('');try{const result=await unlock({data:{password}});if(result.ok){await cache.invalidateQueries({queryKey:['admin-workspace']});setOpen(false);setPassword('');await navigate({to:'/admin'});}else setError(result.error);}catch{setError('Unable to unlock. Please sign in again.');}finally{setBusy(false);}}}><label className="block space-y-2 text-sm">Admin password<Input type="password" aria-label="Admin password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={256}/></label>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} className="w-full">{busy?'Checking…':'Unlock admin panel'}</Button></form>}
 </DialogContent></Dialog></>;
}
