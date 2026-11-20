import { ClientOnly, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PriceChart, type ChartApi, type ChartKind, type Indicators } from "@/components/app/PriceChart";
import { ChartDrawings, type Drawing, type Tool } from "@/components/app/ChartDrawings";
import { AccountIcon, ChartTypeIcons, SymbolIcon, TVMark, ToolIcons, ToolbarIcons } from "@/components/app/icons";
import { useStore, useTick } from "@/lib/store";
import { clearMarketQuote, getQuote, hasFreshMarketQuote, setMarketQuote } from "@/lib/feed";
import { getInhouseMarketQuote } from "@/lib/real-trading.functions";
import { getSymbol } from "@/lib/symbols";
import { InstrumentPicker } from "@/components/app/InstrumentPicker";
import { fmtPrice } from "@/lib/format";
import { DURATIONS, STAKE_STEPS, formatDuration, formatMoney, payoutFor, stepValue } from "@/lib/trading";
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
  useTick();
  const { state, accountMode, realTrades, user } = useStore();
  const [symbol, setSymbol] = useState("BTCUSD");
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
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [quoteError, setQuoteError] = useState('');
  const marketSource: 'okx' | 'inhouse' = getSymbol(symbol).category === 'Crypto' ? 'okx' : 'inhouse';
  const key = `${symbol}:${tf}`;
  const list = drawings[key] ?? [];
  const setDrawings = useCallback((fn: (d: Drawing[]) => Drawing[]) => setDrawingsMap((m) => ({ ...m, [key]: fn(m[key] ?? []) })), [key]);
  const onApi = useCallback((a: ChartApi | null) => setApi(a), []);
  const tfLabel = INTERVALS.find((i) => i.s === tf)?.label ?? "";
  const loadMarketQuote = useServerFn(getInhouseMarketQuote);

  useEffect(() => {
    if (accountMode !== 'real' || !user) { clearMarketQuote(symbol); setQuoteStatus('idle'); setQuoteError(''); return; }
    let active = true;
    setQuoteStatus('connecting');
    setQuoteError('');
    const refresh = async () => {
      try {
        const quote = await loadMarketQuote({ data: { symbol, source: marketSource } });
        if (active) {
          setMarketQuote(symbol, quote.price, quote.bid, quote.ask, quote.timestamp);
          setQuoteStatus('connected');
          setQuoteError('');
        }
      } catch (error) {
        if (active) {
          setQuoteStatus('error');
          setQuoteError(error instanceof Error ? error.message : 'Could not load the market price');
        }
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [accountMode, symbol, user?.id, marketSource, loadMarketQuote]);

  const snapshot = () => {
    if (!api) return;
    api.chart.takeScreenshot().toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `tradeclass-${symbol}-${tfLabel}.png`;
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
        <div className="flex min-w-0 items-center gap-3">{!desktop && <div className="scale-75"><AdminEntry /></div>}<InstrumentPicker symbol={symbol} onChange={setSymbol} liveOnly={accountMode === 'real'} /></div>
        <div className="flex items-center gap-2">
          <span title={quoteStatus === 'error' ? quoteError : undefined} role={accountMode === 'real' && quoteStatus === 'error' ? 'status' : undefined} className={`rounded-full px-2 py-1 text-[10px] font-bold ${accountMode === 'demo' || quoteStatus === 'connected' ? 'bg-success-soft text-success' : quoteStatus === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{accountMode === 'demo' ? 'DEMO MARKET' : quoteStatus === 'connected' ? (marketSource === 'okx' ? 'OKX LIVE' : 'LIVE MARKET') : quoteStatus === 'error' ? 'MARKET UNAVAILABLE' : 'CONNECTING'}</span>
        </div>
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
          <InstrumentPicker symbol={symbol} onChange={setSymbol} compare liveOnly={accountMode === 'real'} />
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
              <PriceChart desktop={desktop} symbol={symbol} timeframe={tf} kind={kind} theme={state.theme} trades={[...state.trades, ...realTrades]} indicators={indicators} onApi={onApi} practice={accountMode === 'demo'} marketSource={marketSource} />
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
            <ChartLegend symbol={symbol} marketSource={marketSource} />
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
          <TradePanel symbol={symbol} marketSource={marketSource} />
          <div className="h-[7px] shrink-0 bg-muted" />
        </>
      )}
      {overlay}
    </div>
    {desktop && <ManualTrade symbol={symbol} marketSource={marketSource} />}
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
  const { realTrades } = useStore();
  const active = realTrades.filter((t) => t.status === "active");
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

function ChartLegend({ symbol, marketSource }: { symbol: string; marketSource: 'okx' | 'inhouse' }) {
  useTick();
  const q = getQuote(symbol);
  const s = getSymbol(symbol);
  const up = q.change >= 0;
  return (
    <div className="pointer-events-none absolute left-[8px] right-[8px] top-[8px] z-10 md:left-[12px] md:top-[10px] md:flex md:flex-wrap md:items-center md:gap-x-[14px] md:gap-y-1">
      <div className="flex h-[20px] min-w-0 max-w-full items-center text-[16.5px] leading-none text-tv-foreground md:text-[18px]">
        <SymbolIcon symbol={symbol} />
        <span className="ml-[5px] truncate">{marketSource === 'okx' ? s.name.replace('U.S. Dollar', 'Tether (USDT)') : s.name}</span>
        <span className="ml-[8px] flex h-[19px] shrink-0 overflow-hidden rounded-full">
          <span className="grid w-[24px] place-items-center bg-status-open">
            <span className="size-[8.5px] rounded-full bg-status-open-dot" />
          </span>
          <span className="grid w-[24px] place-items-center bg-status-delay text-[15px] font-bold leading-none text-status-delay-fg">≈</span>
        </span>
      </div>
      <div className={cn("tabular mt-[4px] whitespace-nowrap text-[13.5px] leading-[18px] md:mt-0 md:text-[14.5px]", up ? "text-candle-up" : "text-candle-down")}>
        {Number.isFinite(q.mid) ? <>{fmtPrice(symbol, q.mid, 1)}&nbsp; {up ? "+" : "−"}{fmtPrice(symbol, Math.abs(q.change), 1)} ({up ? "+" : "−"}{Math.abs(q.changePct).toFixed(2)}%)</> : 'Waiting for live price'}
      </div>
    </div>
  );
}

function AccountPicker() {
  const { accountMode, realBalance, state, setAccountMode } = useStore();
  const real = accountMode === 'real';
  const balance = real ? realBalance : state.balances.USDT;
  const currency = 'USDT';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-[41.5px] items-center rounded-full border border-border pl-[9.5px] pr-[14px] text-left hover:bg-muted md:h-[50px] md:pl-[14px] md:pr-[18px]">
          <AccountIcon account={real ? 'USD' : currency} className="md:size-[34px]" />
          <span className="ml-[11px] mr-[10px] block md:ml-[14px] md:mr-[14px]">
            <span className="block text-[10px] leading-[13px] text-muted-foreground md:text-[12px] md:leading-[16px]">{real ? 'Real Account' : 'Demo Account'}</span>
            <span className="tabular block text-[14.5px] font-bold leading-[18px] md:text-[15.5px] md:leading-[20px]">{formatMoney(balance, currency)}</span>
          </span>
          <ChevronDown className="size-[18px] text-muted-foreground" strokeWidth={1.8} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={() => setAccountMode('demo')} className={`gap-2.5 py-2 ${!real ? 'bg-primary-soft' : ''}`}>
          <AccountIcon account="USDT" />
          <div className="flex-1"><div className="text-[13px] font-medium">Demo Account</div><div className="tabular text-[11px] text-muted-foreground">{formatMoney(state.balances.USDT, 'USDT')}</div></div>
          {!real && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAccountMode('real')} className={`gap-2.5 py-2 ${real ? 'bg-primary-soft' : ''}`}>
          <AccountIcon account="USD" />
          <div className="flex-1"><div className="text-[13px] font-medium">Real Account</div><div className="tabular text-[11px] text-muted-foreground">{formatMoney(realBalance, 'USDT')}</div></div>
          {real && <Check className="size-4 text-primary" />}
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
function useTicket(symbol: string, marketSource: 'okx' | 'inhouse') {
  const { submitRealTrade, placeTrade, accountMode, realBalance, realSettings, siteSettings, state } = useStore();
  const real = accountMode === 'real';
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
  const trade = async (direction: "buy" | "sell") => {
    if (!real) {
      const error = placeTrade({ symbol, direction, stake, duration });
      if (error) toast.error(error);
      else toast(`${direction.toUpperCase()} ${symbol} · ${formatMoney(stake, state.active)} · ${formatDuration(duration)} · demo market`, { duration: 1800 });
      return;
    }
    if (!realSettings.enabled) { toast.error('Live account trading is currently paused by the administrator'); return; }
    if (stake < realSettings.minStake || (realSettings.maxStake > 0 && stake > realSettings.maxStake)) { toast.error(`Minimum stake is ${realSettings.minStake} USDT${realSettings.maxStake > 0 ? `; maximum is ${realSettings.maxStake} USDT` : ''}`); return; }
    if (stake > realSettings.reserveMaxStake) { toast.error(realSettings.reserveMaxStake < realSettings.minStake ? 'Trading is temporarily paused while payout liquidity is replenished' : `Current payout reserve supports stakes up to ${realSettings.reserveMaxStake.toFixed(2)} USDT`); return; }
    if (stake > realBalance) { toast.error('Insufficient available USDT balance'); return; }
    const error = await submitRealTrade({ symbol, direction, stake, duration, marketSource });
    if (error) toast.error(error);
    else toast.success(`${direction.toUpperCase()} ${symbol} · ${stake} USDT · ${formatDuration(duration)} · ${marketSource === 'okx' ? 'OKX' : 'in-house'} price`);
  };
  const disabledReason = !real ? null
    : !siteSettings.trading_enabled ? 'Trading is paused by the administrator.'
    : !realSettings.enabled ? 'Real-account trading is paused by the administrator.'
    : stake < realSettings.minStake ? `Minimum real-account stake is ${realSettings.minStake} USDT.`
    : realSettings.maxStake > 0 && stake > realSettings.maxStake ? `Maximum real-account stake is ${realSettings.maxStake} USDT.`
    : stake > realSettings.reserveMaxStake && realSettings.reserveMaxStake < realSettings.minStake ? 'Trading is temporarily paused while payout liquidity is replenished.'
    : stake > realSettings.reserveMaxStake ? `Payout reserve currently supports stakes up to ${realSettings.reserveMaxStake.toFixed(2)} USDT.`
    : stake > realBalance ? `Available real-account balance is ${realBalance.toFixed(2)} USDT.`
    : null;
  return {
    duration,
    stake,
    stakeText,
    currency: real ? 'USDT' : state.active,
    real,
    disabledReason,
    insufficientBalance: real && stake > realBalance,
    canTrade: real
      ? siteSettings.trading_enabled && realSettings.enabled && stake >= realSettings.minStake && (realSettings.maxStake <= 0 || stake <= realSettings.maxStake) && stake <= realSettings.reserveMaxStake && stake <= realBalance
      : siteSettings.trading_enabled && stake >= 1 && stake <= state.balances[state.active],
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
      {t.real ? <span className="mr-1">USDT</span> : '$'}
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

function TradePanel({ symbol, marketSource }: { symbol: string; marketSource: 'okx' | 'inhouse' }) {
  useTick();
  const t = useTicket(symbol, marketSource);
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
        <span className="tabular text-[13px] font-bold text-success">{t.real ? `${payoutFor(t.stake).toFixed(2)} USDT` : `$${payoutFor(t.stake).toFixed(2)}`}</span>
      </div>
      <div className="mt-[3.5px] grid grid-cols-2 gap-[9px]">
        <TradeButton variant="sell" label="SELL" price={t.real && !hasFreshMarketQuote(symbol) ? "?" : q.bid.toFixed(d)} disabled={!t.canTrade} onClick={() => void t.trade("sell")} />
        <TradeButton variant="buy" label="BUY" price={t.real && !hasFreshMarketQuote(symbol) ? "?" : q.ask.toFixed(d)} disabled={!t.canTrade} onClick={() => void t.trade("buy")} />
      </div>
      {t.disabledReason && <TradeGateNotice message={t.disabledReason} fundingRequired={t.insufficientBalance} compact />}
    </div>
  );
}

function TradeGateNotice({ message, fundingRequired, compact = false }: { message: string; fundingRequired: boolean; compact?: boolean }) {
  return <p role="status" className={cn("text-muted-foreground", compact ? "mt-2 text-[10px] leading-[14px]" : "mt-3 px-1 text-[11px] leading-[16px]")}>{message}{fundingRequired && <> <Link to="/deposit" className="font-semibold text-primary underline underline-offset-2">Deposit USDT</Link> and wait for approval to enable real trades.</>}</p>;
}

function TradeButton({ variant, label, price, onClick, disabled = false }: { variant: "buy" | "sell"; label: string; price: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-[31px] items-center justify-between rounded-[9px] px-[10.5px] text-trade-foreground transition-transform active:scale-[0.97]",
        variant === "sell" ? "bg-sell" : "bg-buy",
        disabled && "cursor-not-allowed opacity-45",
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

function BigTradeButton({ variant, price, onClick, disabled = false }: { variant: "buy" | "sell"; price: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-[60px] w-full items-center justify-between rounded-full pl-[20px] pr-[20px] text-trade-foreground transition-transform active:scale-[0.98]",
        variant === "sell" ? "bg-sell" : "bg-buy",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span className="text-[17px] font-black leading-none">{variant.toUpperCase()}</span>
      <span className={cn("tabular grid h-[30px] min-w-[84px] place-items-center rounded-full px-[10px] text-[15px] font-bold leading-none", variant === "sell" ? "bg-sell-deep" : "bg-buy-deep")}>
        {price}
      </span>
    </button>
  );
}

function ManualTrade({ symbol, marketSource }: { symbol: string; marketSource: 'okx' | 'inhouse' }) {
  useTick();
  const t = useTicket(symbol, marketSource);
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
        <span className="tabular text-[15px] font-bold text-success">{t.real ? `${payoutFor(t.stake).toFixed(2)} USDT` : `$${payoutFor(t.stake).toFixed(2)}`}</span>
      </div>
      <div className="mt-[10px] space-y-[12px]">
        <BigTradeButton variant="sell" price={t.real && !hasFreshMarketQuote(symbol) ? "?" : q.bid.toFixed(d)} disabled={!t.canTrade} onClick={() => void t.trade("sell")} />
        <BigTradeButton variant="buy" price={t.real && !hasFreshMarketQuote(symbol) ? "?" : q.ask.toFixed(d)} disabled={!t.canTrade} onClick={() => void t.trade("buy")} />
      </div>
      {t.disabledReason && <TradeGateNotice message={t.disabledReason} fundingRequired={t.insufficientBalance} />}
      <p className="mt-[14px] px-[4px] text-[11px] leading-[16px] text-muted-foreground">Crypto contracts use OKX prices. Other markets use platform generated prices. These are platform contracts, not exchange orders.</p>
    </aside>
  );
}
