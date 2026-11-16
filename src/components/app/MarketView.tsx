import { ClientOnly, Link } from "@tanstack/react-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PriceChart, type ChartApi, type ChartKind, type Indicators } from "@/components/app/PriceChart";
import { ChartDrawings, type Drawing, type Tool } from "@/components/app/ChartDrawings";
import { AccountIcon, ChartTypeIcons, SymbolIcon, TVMark, ToolIcons, ToolbarIcons } from "@/components/app/icons";
import { useStore, useTick } from "@/lib/store";
import { getQuote } from "@/lib/feed";
import { getSymbol } from "@/lib/symbols";
import { InstrumentPicker } from "@/components/app/InstrumentPicker";
import { fmtPrice } from "@/lib/format";
import { DURATIONS, STAKE_STEPS, formatDuration, formatMoney, payoutFor, stepValue, type AccountId } from "@/lib/trading";
import { cn } from "@/lib/utils";
import { AdminEntry } from "@/components/admin/AdminEntry";

const INTERVALS = [
  { label: "15s", s: 15 },
  { label: "1m", s: 60 },
  { label: "5m", s: 300 },
  { label: "15m", s: 900 },
  { label: "30m", s: 1800 },
  { label: "1h", s: 3600 },
  { label: "4h", s: 14400 },
  { label: "1D", s: 86400 },
];
const FAV_INTERVALS = [60, 1800, 3600];
const CHART_TYPES: { k: ChartKind; label: string }[] = [
  { k: "bars", label: "Bars" },
  { k: "candles", label: "Candles" },
  { k: "hollow", label: "Hollow candles" },
  { k: "line", label: "Line" },
  { k: "area", label: "Area" },
  { k: "baseline", label: "Baseline" },
];
const FAV_TYPES: ChartKind[] = ["bars", "candles", "area"];
const EMOJIS = ["😀", "😎", "🚀", "🔥", "💰", "📈", "📉", "⚠️", "✅", "❌", "⭐", "🎯"];

export function MarketView({ desktop = false, overlay }: { desktop?: boolean; overlay?: ReactNode }) {
  const { state } = useStore();
  const [symbol, setSymbol] = useState("XAUUSD");
  const [tf, setTf] = useState(900);
  const [kind, setKind] = useState<ChartKind>("candles");
  const [indicators, setIndicators] = useState<Indicators>({ ma: false, ema: false });
  const [api, setApi] = useState<ChartApi | null>(null);
  const [tool, setTool] = useState<Tool>("cross");
  const [drawings, setDrawingsMap] = useState<Record<string, Drawing[]>>({});
  const [magnet, setMagnet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [emoji, setEmoji] = useState("😀");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [full, setFull] = useState(false);
  const key = `${symbol}:${tf}`;
  const list = drawings[key] ?? [];
  const setDrawings = useCallback((fn: (d: Drawing[]) => Drawing[]) => setDrawingsMap((m) => ({ ...m, [key]: fn(m[key] ?? []) })), [key]);
  const onApi = useCallback((a: ChartApi | null) => setApi(a), []);
  const tfLabel = INTERVALS.find((i) => i.s === tf)?.label ?? "";

  const snapshot = () => {
    if (!api) return;
    api.chart.takeScreenshot().toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `goldmarket-${symbol}-${tfLabel}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  };

  const pickTool = (t: Tool) => {
    setEmojiOpen(t === "emoji" && tool !== "emoji");
    setTool(tool === t && t !== "cross" ? "cross" : t);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-[45px] shrink-0 items-center justify-between px-[8.5px] md:h-[60px] md:px-[20px]">
        <div className="flex min-w-0 items-center gap-3">{!desktop && <div className="scale-75"><AdminEntry /></div>}<InstrumentPicker symbol={symbol} onChange={setSymbol} /></div>
        <AccountPicker />
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col bg-tv-frame py-px", full && "fixed inset-0 z-50 py-0")}>
        {/* TradingView-style top toolbar */}
        <div className="no-scrollbar flex h-[39px] shrink-0 items-center overflow-x-auto bg-background pl-px text-[14.5px] text-tv-foreground md:h-[50px] md:pl-[6px] md:text-[16.5px]">
          {INTERVALS.filter((i) => FAV_INTERVALS.includes(i.s)).map((i) => (
            <TbButton key={i.s} active={tf === i.s} onClick={() => setTf(i.s)} className="px-[6.5px]">
              {i.label}
            </TbButton>
          ))}
          {!FAV_INTERVALS.includes(tf) && (
            <TbButton active className="px-[4.5px]">
              {tfLabel}
            </TbButton>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="All intervals" className="grid h-[33px] w-[29px] shrink-0 place-items-center rounded-[4px] hover:bg-tv-frame">
                <ChevronDown className="size-[17px]" strokeWidth={1.4} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-36">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Interval</DropdownMenuLabel>
              {INTERVALS.map((i) => (
                <DropdownMenuItem key={i.s} onClick={() => setTf(i.s)} className="justify-between">
                  {i.label} {tf === i.s && <Check className="size-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Sep />
          {FAV_TYPES.map((k) => {
            const Icon = ChartTypeIcons[k];
            return (
              <TbButton key={k} active={kind === k} onClick={() => setKind(k)} className="mx-[2px] w-[35px]" label={CHART_TYPES.find((c) => c.k === k)?.label}>
                <Icon />
              </TbButton>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Chart type" className="grid h-[33px] w-[22px] shrink-0 place-items-center rounded-[4px] hover:bg-tv-frame">
                <ChevronDown className="size-[17px]" strokeWidth={1.4} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              {CHART_TYPES.map(({ k, label }) => {
                const Icon = ChartTypeIcons[k];
                return (
                  <DropdownMenuItem key={k} onClick={() => setKind(k)} className="gap-2">
                    <Icon />
                    <span className="flex-1">{label}</span>
                    {kind === k && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Sep />
          <InstrumentPicker symbol={symbol} onChange={setSymbol} compare />
          <Sep />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Indicators" className="flex h-[33px] w-[35px] shrink-0 items-center justify-center gap-[8px] rounded-[4px] hover:bg-tv-frame md:h-[38px] md:w-auto md:px-[8px]">
                <ToolbarIcons.indicators />
                <span className="hidden md:inline">Indicators</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Indicators</DropdownMenuLabel>
              {(
                [
                  ["ma", "Moving Average (20)"],
                  ["ema", "EMA (50)"],
                ] as const
              ).map(([k, label]) => (
                <DropdownMenuItem key={k} onSelect={(e) => e.preventDefault()} onClick={() => setIndicators((s) => ({ ...s, [k]: !s[k] }))} className="justify-between">
                  {label} {indicators[k] && <Check className="size-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <TbButton onClick={snapshot} className="w-[35px] md:ml-auto md:mr-[14px]" label="Take a snapshot">
            <ToolbarIcons.camera />
          </TbButton>
          <TbButton onClick={() => setFull((f) => !f)} active={full} className="mr-1 w-[35px] md:hidden" label={full ? "Exit full screen" : "Full screen"}>
            <ToolbarIcons.fullscreen />
          </TbButton>
        </div>

        <div className="flex min-h-0 flex-1 gap-[5px] pl-px pt-[4px]">
          {/* Drawing tools */}
          <div className="no-scrollbar relative flex w-[52px] shrink-0 flex-col items-center overflow-y-auto rounded-[5px] bg-background pt-[9px] text-tv-foreground md:w-[64px] md:pt-[12px]">
            <ToolBtn label="Cross" active={tool === "cross"} onClick={() => pickTool("cross")} icon={<ToolIcons.cross />} />
            <ToolBtn label="Trend line" active={tool === "trend"} onClick={() => pickTool("trend")} icon={<ToolIcons.trend />} />
            <ToolBtn label="Fib retracement" active={tool === "fib"} onClick={() => pickTool("fib")} icon={<ToolIcons.fib />} />
            <ToolBtn label="XABCD pattern" active={tool === "pattern"} onClick={() => pickTool("pattern")} icon={<ToolIcons.pattern />} />
            <ToolBtn label="Long position" active={tool === "position"} onClick={() => pickTool("position")} icon={<ToolIcons.position />} />
            <ToolBtn label="Brush" active={tool === "brush"} onClick={() => pickTool("brush")} icon={<ToolIcons.brush />} />
            <ToolBtn label="Text" active={tool === "text"} onClick={() => pickTool("text")} icon={<ToolIcons.text />} />
            <ToolBtn label="Emoji" active={tool === "emoji"} onClick={() => pickTool("emoji")} icon={<ToolIcons.emoji />} />
            <ToolSep />
            <ToolBtn label="Measure" active={tool === "ruler"} onClick={() => pickTool("ruler")} icon={<ToolIcons.ruler />} />
            <ToolBtn label="Zoom in" active={tool === "zoom"} onClick={() => pickTool("zoom")} icon={<ToolIcons.zoom />} />
            <ToolSep />
            <ToolBtn label="Magnet mode" active={magnet} onClick={() => setMagnet((m) => !m)} icon={<ToolIcons.magnet />} />
            <ToolBtn label={hidden ? "Show drawings" : "Hide drawings"} active={hidden} onClick={() => setHidden((h) => !h)} icon={<ToolIcons.eye />} />
            <ToolBtn
              label="Remove drawings"
              onClick={() => {
                if (!list.length) return;
                setDrawings(() => []);
                toast("Drawings removed");
              }}
              icon={<ToolIcons.trash />}
            />
          </div>

          {/* Chart pane */}
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-l-[5px] bg-background">
            <ClientOnly fallback={<div className="absolute inset-0 animate-pulse bg-muted" />}>
              <PriceChart desktop={desktop} symbol={symbol} timeframe={tf} kind={kind} theme={state.theme} trades={state.trades} indicators={indicators} onApi={onApi} />
              <ChartDrawings
                api={api}
                tool={tool}
                onToolDone={() => setTool("cross")}
                drawings={list}
                setDrawings={setDrawings}
                magnet={magnet}
                hidden={hidden}
                emoji={emoji}
                decimals={getSymbol(symbol).decimals + 1}
              />
            </ClientOnly>
            <ChartLegend symbol={symbol} />
            {emojiOpen && tool === "emoji" && (
              <div className="absolute left-1 top-[250px] z-20 grid grid-cols-4 gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setEmoji(e);
                      setEmojiOpen(false);
                    }}
                    className={cn("grid size-8 place-items-center rounded-md text-lg hover:bg-muted", emoji === e && "bg-muted")}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            <ActiveChip />
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="Charting by TradingView"
              className="absolute bottom-[44px] left-[13px] z-10 grid size-[34px] place-items-center rounded-full border border-border bg-background text-tv-foreground"
            >
              <TVMark className="w-[23px]" />
            </a>
          </div>
        </div>
      </div>

      {!desktop && (
        <>
          <TradePanel symbol={symbol} />
          <div className="h-[7px] shrink-0 bg-muted" />
        </>
      )}
      {overlay}
    </div>
    {desktop && <ManualTrade symbol={symbol} />}
    </div>
  );
}

function Sep() {
  return <span className="mx-[6px] h-[20px] w-px shrink-0 bg-tv-frame" />;
}

function TbButton({ active, children, onClick, className, label }: { active?: boolean | undefined; children: ReactNode; onClick?: () => void; className?: string | undefined; label?: string | undefined }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("grid h-[33px] shrink-0 place-items-center rounded-[4px] md:h-[38px] md:min-w-[34px]", active ? "bg-tv-frame" : "hover:bg-tv-frame", className)}
    >
      {children}
    </button>
  );
}

function ToolBtn({ label, active, onClick, icon }: { label: string; active?: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("mb-[6px] grid h-[33px] w-[35px] shrink-0 place-items-center rounded-[6px] md:mb-[8px] md:h-[40px] md:w-[42px] md:[&_svg]:scale-[1.15]", active ? "bg-tv-frame" : "hover:bg-tv-frame")}
    >
      {icon}
    </button>
  );
}

function ToolSep() {
  return <span className="mb-[11px] mt-[5px] h-px w-[37px] shrink-0 bg-tv-frame md:w-[44px]" />;
}

function ActiveChip() {
  useTick();
  const { state } = useStore();
  const active = state.trades.filter((t) => t.status === "active");
  if (!active.length) return null;
  const next = Math.max(0, Math.ceil((Math.min(...active.map((t) => t.expiresAt)) - Date.now()) / 1000));
  return (
    <Link
      to="/trades"
      className="absolute bottom-[34px] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground shadow"
    >
      {active.length} active · {formatDuration(next)}
    </Link>
  );
}

function ChartLegend({ symbol }: { symbol: string }) {
  useTick();
  const q = getQuote(symbol);
  const s = getSymbol(symbol);
  const up = q.change >= 0;
  return (
    <div className="pointer-events-none absolute left-[8px] right-[8px] top-[8px] z-10 md:left-[12px] md:top-[10px] md:flex md:flex-wrap md:items-center md:gap-x-[14px] md:gap-y-1">
      <div className="flex h-[20px] min-w-0 max-w-full items-center text-[16.5px] leading-none text-tv-foreground md:text-[18px]">
        <SymbolIcon symbol={symbol} />
        <span className="ml-[5px] truncate">{s.name}</span>
        <span className="ml-[8px] flex h-[19px] shrink-0 overflow-hidden rounded-full">
          <span className="grid w-[24px] place-items-center bg-status-open">
            <span className="size-[8.5px] rounded-full bg-status-open-dot" />
          </span>
          <span className="grid w-[24px] place-items-center bg-status-delay text-[15px] font-bold leading-none text-status-delay-fg">≈</span>
        </span>
      </div>
      <div className={cn("tabular mt-[4px] whitespace-nowrap text-[13.5px] leading-[18px] md:mt-0 md:text-[14.5px]", up ? "text-candle-up" : "text-candle-down")}>
        {fmtPrice(symbol, q.mid, 1)}&nbsp; {up ? "+" : "−"}
        {fmtPrice(symbol, Math.abs(q.change), 1)} ({up ? "+" : "−"}
        {Math.abs(q.changePct).toFixed(2)}%)
      </div>
    </div>
  );
}

function AccountPicker() {
  const { state, setActive } = useStore();
  const a = state.active;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-[41.5px] items-center rounded-full border border-border pl-[9.5px] pr-[14px] text-left hover:bg-muted md:h-[50px] md:pl-[14px] md:pr-[18px]">
          <AccountIcon account={a} className="md:size-[34px]" />
          <span className="ml-[11px] mr-[10px] block md:ml-[14px] md:mr-[14px]">
            <span className="block text-[10px] leading-[13px] text-muted-foreground md:text-[12px] md:leading-[16px]">Practice {a} Account</span>
            <span className="tabular block text-[14.5px] font-bold leading-[18px] md:text-[15.5px] md:leading-[20px]">{formatMoney(state.balances[a], a)}</span>
          </span>
          <ChevronDown className="size-[18px] text-muted-foreground" strokeWidth={1.8} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {(["USD", "USDT"] as AccountId[]).map((id) => (
          <DropdownMenuItem key={id} onClick={() => setActive(id)} className={cn("gap-2.5 py-2", id === a && "bg-primary-soft")}>
            <AccountIcon account={id} />
            <div className="flex-1">
              <div className="text-[13px] font-medium">Practice {id} Account</div>
              <div className="tabular text-[11px] text-muted-foreground">{formatMoney(state.balances[id], id)}</div>
            </div>
            {id === a && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/deposit" className="gap-2.5 py-2 text-[13px] font-medium text-primary">
            <Wallet className="size-4" /> Deposit
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MinusGlyph() {
  return <span className="block h-[2.6px] w-[8px] rounded-full bg-foreground" />;
}

function Stepper({ label, value, onMinus, onPlus, children }: { label: string; value?: string; onMinus: () => void; onPlus: () => void; children?: ReactNode }) {
  return (
    <div>
      <div className="mb-[2.5px] text-[11.5px] leading-[16px] text-muted-foreground">{label}</div>
      <div className="flex h-[34px] items-center rounded-[6px] border border-input">
        <button aria-label={`Decrease ${label}`} onClick={onMinus} className="grid h-full w-[36px] place-items-center rounded-l-[6px] hover:bg-muted">
          <MinusGlyph />
        </button>
        <div className="tabular flex-1 text-center text-[13.5px] font-medium">{children ?? value}</div>
        <button aria-label={`Increase ${label}`} onClick={onPlus} className="grid h-full w-[36px] place-items-center rounded-r-[6px] hover:bg-muted">
          <Plus className="size-[15px]" strokeWidth={3.2} />
        </button>
      </div>
    </div>
  );
}

/** Shared duration/stake state and order placement for both trade panels. */
function useTicket(symbol: string) {
  const { placeTrade } = useStore();
  const [duration, setDuration] = useState(5);
  const [stake, setStake] = useState(5);
  const [stakeText, setStakeText] = useState("5");
  const updateStake = (v: number) => {
    setStake(v);
    setStakeText(String(v));
  };
  const typeStake = (raw: string) => {
    const t = raw.replace(/[^0-9.]/g, "");
    setStakeText(t);
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) setStake(Math.round(n * 100) / 100);
  };
  const trade = (direction: "buy" | "sell") => {
    const err = placeTrade({ symbol, direction, stake, duration });
    if (err) toast.error(err);
    else toast(`${direction.toUpperCase()} ${symbol} · $${stake} · ${formatDuration(duration)}`, { duration: 1800 });
  };
  return {
    duration,
    stake,
    stakeText,
    durationDown: () => setDuration(stepValue(DURATIONS, duration, -1)),
    durationUp: () => setDuration(stepValue(DURATIONS, duration, 1)),
    stakeDown: () => updateStake(stepValue(STAKE_STEPS, stake, -1)),
    stakeUp: () => updateStake(stepValue(STAKE_STEPS, stake, 1)),
    typeStake,
    resetStakeText: () => setStakeText(String(stake)),
    trade,
  };
}

function StakeInput({ t, className }: { t: ReturnType<typeof useTicket>; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <span className={cn("inline-flex items-center", className)} onClick={() => inputRef.current?.focus()}>
      $
      <input
        ref={inputRef}
        aria-label="Stake amount"
        inputMode="decimal"
        value={t.stakeText}
        onChange={(e) => t.typeStake(e.target.value)}
        onBlur={t.resetStakeText}
        className="bg-transparent outline-none"
        style={{ width: `${Math.max(1, t.stakeText.length) * 0.58 + 0.1}em` }}
      />
    </span>
  );
}

function TradePanel({ symbol }: { symbol: string }) {
  useTick();
  const t = useTicket(symbol);
  const q = getQuote(symbol);
  const d = getSymbol(symbol).decimals;

  return (
    <div className="shrink-0 border-t border-border px-[13px] pb-[8.5px] pt-[8px]">
      <div className="grid grid-cols-2 gap-[7px]">
        <Stepper label="Duration" value={formatDuration(t.duration)} onMinus={t.durationDown} onPlus={t.durationUp} />
        <Stepper label="Stake" onMinus={t.stakeDown} onPlus={t.stakeUp}>
          <StakeInput t={t} className="justify-center text-center" />
        </Stepper>
      </div>
      <div className="mt-[4px] flex h-[18px] items-center justify-between">
        <span className="text-[11.5px] text-muted-foreground">Payout</span>
        <span className="tabular text-[13px] font-bold text-success">${payoutFor(t.stake).toFixed(2)}</span>
      </div>
      <div className="mt-[3.5px] grid grid-cols-2 gap-[9px]">
        <TradeButton variant="sell" label="SELL" price={q.bid.toFixed(d)} onClick={() => t.trade("sell")} />
        <TradeButton variant="buy" label="BUY" price={q.ask.toFixed(d)} onClick={() => t.trade("buy")} />
      </div>
    </div>
  );
}

function TradeButton({ variant, label, price, onClick }: { variant: "buy" | "sell"; label: string; price: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-[31px] items-center justify-between rounded-[9px] px-[10.5px] text-trade-foreground transition-transform active:scale-[0.97]",
        variant === "sell" ? "bg-sell" : "bg-buy",
      )}
    >
      <span className="text-[14.5px] font-bold leading-none">{label}</span>
      <span className={cn("tabular grid h-[17px] min-w-[61px] place-items-center rounded-full px-[6px] text-[12.5px] font-medium leading-none", variant === "sell" ? "bg-sell-deep" : "bg-buy-deep")}>
        {price}
      </span>
    </button>
  );
}

/* ---------- Desktop "Manual trade" column ---------- */

function RoundStep({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid size-[44px] shrink-0 place-items-center rounded-full border border-border bg-background shadow-[0_1px_3px_rgba(0,0,0,0.12)] hover:bg-muted"
    >
      {children}
    </button>
  );
}

function TicketCard({ label, value, onMinus, onPlus }: { label: string; value: ReactNode; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="rounded-[14px] border border-border px-[13px] pb-[12px] pt-[12px]">
      <div className="text-[13px] leading-[18px] text-muted-foreground">{label}</div>
      <div className="mt-[2px] flex items-center">
        <div className="tabular min-w-0 flex-1 text-[16.5px] font-bold">{value}</div>
        <div className="flex gap-[6px]">
          <RoundStep label={`Decrease ${label}`} onClick={onMinus}>
            <MinusGlyph />
          </RoundStep>
          <RoundStep label={`Increase ${label}`} onClick={onPlus}>
            <Plus className="size-[16px]" strokeWidth={2.6} />
          </RoundStep>
        </div>
      </div>
    </div>
  );
}

function BigTradeButton({ variant, price, onClick }: { variant: "buy" | "sell"; price: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-[60px] w-full items-center justify-between rounded-full pl-[20px] pr-[20px] text-trade-foreground transition-transform active:scale-[0.98]",
        variant === "sell" ? "bg-sell" : "bg-buy",
      )}
    >
      <span className="text-[17px] font-black leading-none">{variant.toUpperCase()}</span>
      <span className={cn("tabular grid h-[30px] min-w-[84px] place-items-center rounded-full px-[10px] text-[15px] font-bold leading-none", variant === "sell" ? "bg-sell-deep" : "bg-buy-deep")}>
        {price}
      </span>
    </button>
  );
}

function ManualTrade({ symbol }: { symbol: string }) {
  useTick();
  const t = useTicket(symbol);
  const q = getQuote(symbol);
  const d = getSymbol(symbol).decimals;
  return (
    <aside aria-label="Manual trade" className="flex w-[262px] shrink-0 flex-col overflow-y-auto border-l border-border bg-background px-[15px] pt-[11px]">
      <h2 className="text-[17px] font-bold leading-[22px]">Manual trade</h2>
      <div className="mt-[5px] space-y-[13px]">
        <TicketCard label="Duration" value={formatDuration(t.duration)} onMinus={t.durationDown} onPlus={t.durationUp} />
        <TicketCard label="Stake" value={<StakeInput t={t} />} onMinus={t.stakeDown} onPlus={t.stakeUp} />
      </div>
      <div className="mt-[16px] flex items-center justify-between px-[5px]">
        <span className="text-[13px] text-muted-foreground">Payout</span>
        <span className="tabular text-[15px] font-bold text-success">${payoutFor(t.stake).toFixed(2)}</span>
      </div>
      <div className="mt-[10px] space-y-[12px]">
        <BigTradeButton variant="sell" price={q.bid.toFixed(d)} onClick={() => t.trade("sell")} />
        <BigTradeButton variant="buy" price={q.ask.toFixed(d)} onClick={() => t.trade("buy")} />
      </div>
      <p className="mt-[14px] px-[4px] text-[11px] leading-[16px] text-muted-foreground">Practice money only. Prices are simulated.</p>
    </aside>
  );
}
