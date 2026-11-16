import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { PageHeader } from "@/components/app/PageHeader";
import { pageHead } from "@/components/app/meta";
import { useStore } from "@/lib/store";
import { formatMoney } from "@/lib/trading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions")({
  head: () => pageHead("Transactions", "Every practice deposit, withdrawal and transfer on your account."),
  component: TransactionsPage,
});

const TABS = [
  { id: "all", label: "All" },
  { id: "topup", label: "Deposits" },
  { id: "withdrawal", label: "Withdrawals" },
] as const;

function TransactionsPage() {
  const { state } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const list = state.transactions.filter((t) => tab === "all" || t.kind === tab);
  return (
    <div className="pb-6">
      <PageHeader title="Transactions" compact />
      <div className="mt-[21px] grid grid-cols-3 px-[16.5px]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "h-[46px] border-b-[3px] text-[15.5px]",
              tab === t.id ? "border-primary font-bold text-foreground" : "border-transparent font-medium text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-[7px] px-[16.5px] pt-[12px]">
        {list.length === 0 && <p className="py-12 text-center text-[14.5px] text-muted-foreground">No transactions yet</p>}
        {list.map((t) => (
          <div key={t.id} className="flex h-[60px] items-center justify-between rounded-[13px] border border-border pl-[12.5px] pr-[12.5px]">
            <div>
              <span
                className={cn(
                  "inline-grid h-[17.5px] place-items-center rounded-full px-[10px] text-[12.5px] font-medium leading-none",
                  t.kind === "topup" ? "bg-success-soft text-success" : t.kind === "withdrawal" ? "bg-destructive-soft text-destructive" : "bg-primary-soft text-primary",
                )}
              >
                {t.kind === "topup" ? "Deposit" : t.kind === "withdrawal" ? "Withdrawal" : "Transfer"}
              </span>
              <div className="mt-[6px] flex gap-[14px] pl-[8px] text-[11.5px] leading-[14px]">
                <span className="text-[10.5px] text-foreground">Completed</span>
                <span className="text-muted-foreground">{t.kind === "transfer" ? `${t.account} → ${t.to}` : `Practice ${t.account}`}</span>
              </div>
            </div>
            <div className="text-right">
              <div className={cn("tabular text-[13.5px] font-bold leading-[18px]", t.kind === "topup" ? "text-success" : t.kind === "withdrawal" ? "text-destructive" : "text-foreground")}>
                {t.kind === "topup" ? "+" : t.kind === "withdrawal" ? "-" : ""}{formatMoney(t.amount)} {t.kind === "transfer" ? "" : t.account}
              </div>
              <div className="mt-[5px] text-[10.5px] leading-[13px] text-muted-foreground">{format(t.at, "MMM d, hh:mm a")}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
