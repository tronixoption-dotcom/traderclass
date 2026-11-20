import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader, InfoNote } from "@/components/app/PageHeader";
import { SymbolIcon } from "@/components/app/icons";
import { pageHead } from "@/components/app/meta";
import { useStore, type RobotConfig } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/copy-trading")({
  head: () => pageHead("Strategy presets", "Choose an automated trading strategy for your account."),
  component: CopyTradingPage,
});

const STYLES: { id: string; name: string; symbol: string; strategy: RobotConfig["strategy"]; duration: number; about: string }[] = [
  { id: "btc-trend", name: "Bitcoin momentum", symbol: "BTCUSD", strategy: "trend", duration: 10, about: "Follows the last Bitcoin move, 10 second trades" },
  { id: "eth-reverse", name: "Ethereum reversal", symbol: "ETHUSD", strategy: "reverse", duration: 15, about: "Follows a reversal setup on ETH/USDT, 15 second trades" },
  { id: "sol-trend", name: "Solana momentum", symbol: "SOLUSD", strategy: "trend", duration: 15, about: "Follows the last move on SOL/USDT, 15 second trades" },
  { id: "xrp-reverse", name: "XRP reversal", symbol: "XRPUSD", strategy: "reverse", duration: 15, about: "Follows a reversal setup on XRP/USDT, 15 second trades" },
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
                {copying ? "Stop" : "Use"}
              </button>
            </div>
          );
        })}
        <InfoNote className="pt-[10px]">Selecting a preset starts the Robot with your configured stake. Demo mode uses virtual funds and a simulated feed; live mode uses your USDT balance, OKX crypto prices, and platform generated prices for other markets. Strategies do not copy a person or predict results.</InfoNote>
      </div>
    </div>
  );
}
