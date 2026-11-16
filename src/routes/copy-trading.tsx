import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader, PracticeNote } from "@/components/app/PageHeader";
import { SymbolIcon } from "@/components/app/icons";
import { pageHead } from "@/components/app/meta";
import { useStore, type RobotConfig } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/copy-trading")({
  head: () => pageHead("Copy trading", "Copy a practice trading style and let the robot follow it."),
  component: CopyTradingPage,
});

const STYLES: { id: string; name: string; symbol: string; strategy: RobotConfig["strategy"]; duration: number; about: string }[] = [
  { id: "gold-trend", name: "Gold trend", symbol: "XAUUSD", strategy: "trend", duration: 15, about: "Follows the last move on gold, 15 second trades" },
  { id: "euro-reverse", name: "Euro reversal", symbol: "EURUSD", strategy: "reverse", duration: 30, about: "Bets the last EUR/USD move turns around, 30 second trades" },
  { id: "btc-trend", name: "Bitcoin momentum", symbol: "BTCUSD", strategy: "trend", duration: 10, about: "Follows the last Bitcoin move, 10 second trades" },
  { id: "pound-random", name: "Pound coin flip", symbol: "GBPUSD", strategy: "random", duration: 15, about: "Picks BUY or SELL at random on GBP/USD" },
];

function CopyTradingPage() {
  const { state, setRobot } = useStore();
  const navigate = useNavigate();
  const r = state.robot;
  return (
    <div className="pb-6">
      <PageHeader title="Copy trading" compact />
      <div className="space-y-[7px] px-[16.5px] pt-[14px]">
        {STYLES.map((s) => {
          const copying = r.running && r.symbol === s.symbol && r.strategy === s.strategy && r.duration === s.duration;
          return (
            <div key={s.id} className="flex items-center rounded-[14px] border border-border px-[14px] py-[11px]">
              <SymbolIcon symbol={s.symbol} className="size-[29px] text-[10px]" />
              <div className="ml-[11px] flex-1">
                <div className="text-[14px] font-medium">{s.name}</div>
                <div className="text-[11.5px] leading-[15px] text-muted-foreground">{s.about}</div>
              </div>
              <button
                onClick={() => {
                  if (copying) setRobot({ running: false });
                  else {
                    setRobot({ symbol: s.symbol, strategy: s.strategy, duration: s.duration, running: true });
                    navigate({ to: "/robot" });
                  }
                }}
                className={cn("ml-2 h-[30px] rounded-full px-[14px] text-[12.5px] font-bold", copying ? "bg-sell text-trade-foreground" : "bg-primary text-primary-foreground")}
              >
                {copying ? "Stop" : "Copy"}
              </button>
            </div>
          );
        })}
        <PracticeNote className="pt-[10px]">Copying starts the practice robot with that style, using your robot stake. These are simple rules, not real traders.</PracticeNote>
      </div>
    </div>
  );
}
