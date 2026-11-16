import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader, InfoNote } from "@/components/app/PageHeader";
import { SymbolIcon } from "@/components/app/icons";
import { pageHead } from "@/components/app/meta";
import { useStore, type RobotConfig } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/copy-trading")({
  head: () => pageHead("Strategy presets", "Choose an automated trading strategy for a demo or live USDT account."),
  component: CopyTradingPage,
});

const STYLES: { id: string; name: string; symbol: string; strategy: RobotConfig["strategy"]; duration: number; about: string }[] = [
  { id: "gold-trend", name: "Gold trend", symbol: "XAUUSD", strategy: "trend", duration: 15, about: "Follows the last move on gold, 15 second trades" },
  { id: "euro-reverse", name: "Euro reversal", symbol: "EURUSD", strategy: "reverse", duration: 30, about: "Bets the last EUR/USD move turns around, 30 second trades" },
  { id: "btc-trend", name: "Bitcoin momentum", symbol: "BTCUSD", strategy: "trend", duration: 10, about: "Follows the last Bitcoin move, 10 second trades" },
  { id: "eth-reverse", name: "Ethereum reversal", symbol: "ETHUSD", strategy: "reverse", duration: 15, about: "Follows a reversal setup on ETH/USDT, 15 second trades" },
  { id: "pound-random", name: "Pound coin flip", symbol: "GBPUSD", strategy: "random", duration: 15, about: "Picks BUY or SELL at random on GBP/USD" },
];

function CopyTradingPage() {
  const { state, setRobot, accountMode } = useStore();
  const navigate = useNavigate();
  const r = state.robot;
  return (
    <div className="pb-6">
      <PageHeader title="Copy trading" compact />
      <div className="space-y-[7px] px-[16.5px] pt-[14px]">
        {STYLES.filter((style) => accountMode !== 'real' || ['BTCUSD', 'ETHUSD'].includes(style.symbol)).map((s) => {
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
                {copying ? "Stop" : "Use"}
              </button>
            </div>
          );
        })}
        <InfoNote className="pt-[10px]">Selecting a preset starts the Robot with your configured stake and risk limits. Strategies follow simple price rules; they do not copy a person or predict results. Live mode is limited to supported OKX crypto markets.</InfoNote>
      </div>
    </div>
  );
}
