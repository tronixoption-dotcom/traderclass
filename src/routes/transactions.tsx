import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowDownToLine, ArrowUpFromLine, Clock3, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { loadFunding } from "@/lib/funding.functions";
import { loadMpesaWallet } from "@/lib/mpesa.functions";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions")({ head: () => pageHead("Transactions", "Review deposits and withdrawals across your payment methods."), component: TransactionsPage });
type FundingData = Awaited<ReturnType<typeof loadFunding>>;
type MpesaData = Awaited<ReturnType<typeof loadMpesaWallet>>;
type Row = { id: string; kind: string; status: string; amount: number; asset: string; method: string; reference: string; created: string };
const TABS = [{ id: 'all', label: 'All' }, { id: 'deposit', label: 'Deposits' }, { id: 'withdrawal', label: 'Withdrawals' }] as const;
const amountText = (amount: number, asset: string) => `${asset==='KES'?'KES ':'$'}${Number(amount).toLocaleString('en-US',{maximumFractionDigits:asset==='KES'?0:8})}${asset==='USDT'?' USDT':''}`;

function TransactionsPage() {
  const { user } = useStore(); const [tab,setTab]=useState<(typeof TABS)[number]['id']>('all');
  const [funding,setFunding]=useState<FundingData|null>(null); const [mpesa,setMpesa]=useState<MpesaData|null>(null); const [loading,setLoading]=useState(false);
  const refresh=useCallback(async()=>{if(!user)return;setLoading(true);try{const [f,m]=await Promise.all([loadFunding(),loadMpesaWallet()]);setFunding(f);setMpesa(m);}finally{setLoading(false);}},[user]);
  useEffect(()=>{void refresh().catch(()=>undefined);},[refresh]);
  useEffect(()=>{const pending=funding?.transactions.some((tx)=>tx.status==='under_review'||tx.status==='processing')||mpesa?.transactions.some((tx)=>tx.status==='pending'||tx.status==='processing');if(!pending)return;const timer=setInterval(()=>{void refresh().catch(()=>undefined);},8000);return()=>clearInterval(timer);},[funding,mpesa,refresh]);
  const rows:Row[]=[...(funding?.transactions??[]).map((tx)=>({id:tx.id,kind:tx.kind,status:tx.status==='under_review'?'processing':tx.status,amount:Number(tx.amount),asset:tx.asset,method:tx.method_name,reference:tx.user_reference||tx.destination,created:tx.created_at})),...(mpesa?.transactions??[]).map((tx)=>({id:tx.id,kind:tx.kind,status:tx.status,amount:Number(tx.amount_kes),asset:'KES',method:'M-Pesa',reference:tx.mpesa_receipt_number||tx.phone_number,created:tx.created_at}))].sort((a,b)=>Date.parse(b.created)-Date.parse(a.created));
  const visible=rows.filter((row)=>tab==='all'||row.kind===tab);
  return <div className="pb-6"><PageHeader title="Transactions" compact/>
    <div className="mx-[16.5px] mt-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4"><div><p className="text-xs text-muted-foreground">Wallet balances</p><p className="mt-1 text-sm font-bold">USD {Number(funding?.wallets.find((wallet)=>wallet.asset==='USD')?.balance??0).toLocaleString()} · USDT {Number(funding?.wallets.find((wallet)=>wallet.asset==='USDT')?.balance??0).toLocaleString()} · KES {Number(mpesa?.balanceKes??0).toLocaleString()}</p></div><button type="button" onClick={()=>void refresh()} disabled={loading} aria-label="Refresh transactions" className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted"><RefreshCw className={cn('size-4',loading&&'animate-spin')}/></button></div>
    <div className="mt-[21px] grid grid-cols-3 px-[16.5px]" role="tablist">{TABS.map((item)=><button key={item.id} role="tab" aria-selected={tab===item.id} onClick={()=>setTab(item.id)} className={cn('h-[46px] border-b-[3px] text-[15.5px]',tab===item.id?'border-primary font-bold text-foreground':'border-transparent font-medium text-muted-foreground')}>{item.label}</button>)}</div>
    <div className="space-y-2 px-[16.5px] pt-3">{!funding&&<p className="py-12 text-center text-sm text-muted-foreground">{loading?'Loading transactions…':'Sign in to view your transactions.'}</p>}{funding&&visible.length===0&&<div className="py-14 text-center"><Clock3 className="mx-auto size-8 text-muted-foreground/60"/><p className="mt-3 text-sm text-muted-foreground">No transactions yet</p></div>}{visible.map((tx)=>{const deposit=tx.kind==='deposit';const processing=tx.status==='pending'||tx.status==='processing';const status=tx.status==='completed'?'Completed':tx.status==='failed'||tx.status==='rejected'?'Rejected':processing?'Processing':tx.status;return <article key={`${tx.method}-${tx.id}`} className="flex min-h-[76px] items-center justify-between gap-3 rounded-[13px] border border-border bg-card px-3"><div className="flex min-w-0 items-center gap-3"><span className={cn('grid size-10 shrink-0 place-items-center rounded-full',deposit?'bg-success-soft text-success':'bg-primary-soft text-primary')}>{deposit?<ArrowDownToLine className="size-5"/>:<ArrowUpFromLine className="size-5"/>}</span><div className="min-w-0"><p className="text-sm font-semibold">{deposit?'Deposit':'Withdrawal'}</p><p className="mt-1 truncate text-xs text-muted-foreground">{status} · {tx.method}{tx.reference?` · ${tx.reference}`:''}</p></div></div><div className="shrink-0 text-right"><p className={cn('text-sm font-bold tabular-nums',deposit?'text-success':'text-foreground')}>{deposit?'+':'−'}{amountText(tx.amount,tx.asset)}</p><p className="mt-1 text-[10px] text-muted-foreground">{format(new Date(tx.created),'MMM d, hh:mm a')}</p></div></article>})}</div>
  </div>;
}
