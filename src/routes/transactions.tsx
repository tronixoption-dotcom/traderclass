import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowDownToLine, ArrowUpFromLine, Clock3, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { loadMpesaWallet } from "@/lib/mpesa.functions";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions")({
  head: () => pageHead("Transactions", "Review your deposit and withdrawal history."),
  component: TransactionsPage,
});

const TABS = [
  { id: "all", label: "All" },
  { id: "deposit", label: "Deposits" },
  { id: "withdrawal", label: "Withdrawals" },
] as const;
type WalletData = Awaited<ReturnType<typeof loadMpesaWallet>>;
const kes = (n: number | string) => `KES ${Number(n).toLocaleString("en-KE")}`;

function TransactionsPage() {
  const { user } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try { setData(await loadMpesaWallet()); } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [user]);
  const list = (data?.transactions ?? []).filter((tx) => tab === "all" || tx.kind === tab);

  return (
    <div className="pb-6">
      <PageHeader title="Transactions" compact />
      <div className="mx-[16.5px] mt-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
        <div><p className="text-xs text-muted-foreground">KES wallet balance</p><p className="mt-1 text-xl font-bold tabular-nums">{kes(data?.balanceKes ?? 0)}</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh transactions" className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted"><RefreshCw className={cn("size-4", loading && "animate-spin")} /></button>
      </div>
      <div className="mt-[21px] grid grid-cols-3 px-[16.5px]" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("h-[46px] border-b-[3px] text-[15.5px]", tab === t.id ? "border-primary font-bold text-foreground" : "border-transparent font-medium text-muted-foreground")}>{t.label}</button>)}
      </div>
      <div className="space-y-2 px-[16.5px] pt-3">
        {!data && <p className="py-12 text-center text-sm text-muted-foreground">{loading ? "Loading transactions…" : "Sign in to view your transactions."}</p>}
        {data && list.length === 0 && <div className="py-14 text-center"><Clock3 className="mx-auto size-8 text-muted-foreground/60"/><p className="mt-3 text-sm text-muted-foreground">No transactions yet</p></div>}
        {list.map((tx) => {
          const deposit = tx.kind === "deposit";
          const pending = tx.status === "pending" || tx.status === "processing";
          return <article key={tx.id} className="flex min-h-[76px] items-center justify-between gap-3 rounded-[13px] border border-border bg-card px-3">
            <div className="flex min-w-0 items-center gap-3"><span className={cn("grid size-10 shrink-0 place-items-center rounded-full", deposit ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>{deposit ? <ArrowDownToLine className="size-5"/> : <ArrowUpFromLine className="size-5"/>}</span><div className="min-w-0"><p className="text-sm font-semibold">{deposit ? "Deposit" : "Withdrawal"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{tx.phone_number}{tx.mpesa_receipt_number ? ` · ${tx.mpesa_receipt_number}` : ""}</p><span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", tx.status === "completed" ? "bg-success-soft text-success" : tx.status === "failed" ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground")}>{pending ? "In progress" : tx.status}</span></div></div>
            <div className="shrink-0 text-right"><p className={cn("text-sm font-bold tabular-nums", deposit ? "text-success" : "text-foreground")}>{deposit ? "+" : "−"}{kes(tx.amount_kes)}</p><p className="mt-1 text-[10px] text-muted-foreground">{format(new Date(tx.created_at), "MMM d, hh:mm a")}</p></div>
          </article>;
        })}
      </div>
    </div>
  );
}
