import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/app/PageHeader";
import { SymbolIcon, TradesIcon } from "@/components/app/icons";
import { pageHead } from "@/components/app/meta";
import { useStore, useTick, type Trade } from "@/lib/store";
import { getPrice, hasFreshMarketQuote } from "@/lib/feed";
import { fmtPrice } from "@/lib/format";
import { formatDuration, payoutFor } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { getSymbol } from "@/lib/symbols";

export const Route = createFileRoute("/trades")({
  head: () => pageHead("Trades", "Review your demo and live trade activity."),
  component: TradesPage,
});

function TradesPage() {
  useTick();
  const { realTrades, accountMode, state } = useStore();
  const allTrades = [...(accountMode === 'real' ? realTrades : state.trades)].sort((a, b) => b.openedAt - a.openedAt);
  const active = allTrades.filter((t) => t.status === "active");
  const history = allTrades.filter((t) => t.status !== "active");
  return (
    <div>
      <PageHeader title="Trades" />
      <section className="px-[20px] pt-[32px]">
        <h2 className="border-b border-border pb-[6px] text-[16.5px] font-bold leading-[22px]">Active Trades</h2>
        {active.length === 0 ? (
          <Empty className="pb-[29px] pt-[28px]" icon={<TradesIcon className="h-[28px] w-[33px] opacity-35" />} text="No active trades at the moment" />
        ) : (
          <div className="space-y-[7px] py-[12px]">
            {active.map((t) => (
              <ActiveRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>
      <section className="px-[20px]">
        <h2 className="border-b border-border pb-[6px] text-[16.5px] font-bold leading-[22px]">History</h2>
        {history.length === 0 ? (
          <Empty className="pt-[87px]" icon={<History className="size-[29px] opacity-35" strokeWidth={2.4} />} text="No trade history available" />
        ) : (
          <div className="space-y-[7px] py-[12px]">
            {history.map((t) => (
              <HistoryRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Empty({ icon, text, className }: { icon: React.ReactNode; text: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-[8px] text-[14.5px] leading-[20px] text-muted-foreground", className)}>
      {icon}
      {text}
    </div>
  );
}

function DirTag({ d }: { d: Trade["direction"] }) {
  return (
    <span className={cn("rounded-[5px] px-[6px] py-px text-[10px] font-bold text-trade-foreground", d === "buy" ? "bg-buy" : "bg-sell")}>
      {d.toUpperCase()}
    </span>
  );
}

function ActiveRow({ t }: { t: Trade }) {
  const now = Date.now();
  const left = Math.max(0, Math.ceil((t.expiresAt - now) / 1000));
  const pct = Math.min(100, ((now - t.openedAt) / (t.expiresAt - t.openedAt)) * 100);
  const price = !t.real || hasFreshMarketQuote(t.symbol) ? getPrice(t.symbol) : undefined;
  const winning = price === undefined ? null : t.direction === "buy" ? price > t.entry : price < t.entry;
  return (
    <div className="rounded-[14px] border border-border px-[13px] py-[11px]">
      <div className="flex items-center gap-[10px]">
        <SymbolIcon symbol={t.symbol} className="size-[29px] text-[10px]" />
        <div className="flex-1">
          <div className="flex items-center gap-[6px] text-[13.5px] font-bold">
            {t.symbol} <DirTag d={t.direction} />
            <span className="text-[10px] font-medium text-muted-foreground">{t.real ? getSymbol(t.symbol).category === 'Crypto' ? 'Live · OKX prices' : 'Live · Platform prices' : 'Demo'}</span>
            {t.byRobot && <span className="text-[10.5px] font-normal text-muted-foreground">Robot</span>}
          </div>
          <div className="tabular text-[11.5px] text-muted-foreground">
            Entry {fmtPrice(t.symbol, t.entry)} · Now {price === undefined ? 'Market price unavailable' : fmtPrice(t.symbol, price)}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-[14.5px] font-bold">{formatDuration(left)}</div>
          <div className={cn("tabular text-[12px] font-medium", winning === null ? "text-muted-foreground" : winning ? "text-success" : "text-destructive")}>
            {winning === null ? '—' : winning ? `+USDT ${(payoutFor(t.stake) - t.stake).toFixed(2)}` : `-USDT ${t.stake.toFixed(2)}`}
          </div>
        </div>
      </div>
      <div className="mt-[9px] h-[4px] overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HistoryRow({ t }: { t: Trade }) {
  const profit = (t.payout ?? 0) - t.stake;
  return (
    <div className="flex items-center gap-[10px] rounded-[14px] border border-border px-[13px] py-[11px]">
      <SymbolIcon symbol={t.symbol} className="size-[29px] text-[10px]" />
      <div className="flex-1">
        <div className="flex items-center gap-[6px] text-[13.5px] font-bold">
          {t.symbol} <DirTag d={t.direction} />
          <span className="text-[10px] font-medium text-muted-foreground">{t.real ? getSymbol(t.symbol).category === 'Crypto' ? 'Live · OKX prices' : 'Live · Platform prices' : 'Demo'}</span>
        </div>
        <div className="tabular text-[11.5px] text-muted-foreground">
          {fmtPrice(t.symbol, t.entry)} → {fmtPrice(t.symbol, t.close ?? t.entry)} · {t.account} {t.stake} · {formatDuration(t.duration)}
        </div>
      </div>
      <div className="text-right">
        <div className={cn("tabular text-[13.5px] font-bold", t.status === "won" ? "text-success" : t.status === "lost" ? "text-destructive" : "text-muted-foreground")}>
          {t.status === "draw" ? `${t.account} 0.00` : `${profit >= 0 ? "+" : "-"}${t.account} ${Math.abs(profit).toFixed(2)}`}
        </div>
        <div className="text-[10.5px] text-muted-foreground">{format(t.openedAt, "MMM d, HH:mm:ss")}</div>
      </div>
    </div>
  );
}
