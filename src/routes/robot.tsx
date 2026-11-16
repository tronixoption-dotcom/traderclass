import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AccountSelect } from "@/components/app/AccountSelect";
import { PageHeader } from "@/components/app/PageHeader";
import { InstrumentPicker } from "@/components/app/InstrumentPicker";
import { pageHead } from "@/components/app/meta";
import { buildHistory } from "@/lib/feed";
import { robotSession, useStore } from "@/lib/store";
import { DURATIONS, STAKE_STEPS, backtestWinRate, formatDuration, formatMoney, round2, stepValue } from "@/lib/trading";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/robot")({
  head: () => pageHead("Robot Settings", "Set up the practice robot: account, stake, duration, market, stop loss and take profit."),
  component: RobotPage,
});

const ROBOT_NAMES = { trend: "Scalping Index", reverse: "Reversal Index", random: "Random Index" } as const;

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-[9px]">
      <div className="text-[13px] font-semibold leading-[17px]">{title}</div>
      <div className="text-[11.5px] leading-[16px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Stepper({ value, onMinus, onPlus, disabled, label }: { value: string; onMinus: () => void; onPlus: () => void; disabled: boolean; label: string }) {
  return (
    <div className={cn("flex h-[48px] items-center rounded-[11px] border border-input", disabled && "opacity-60")}>
      <button disabled={disabled} aria-label={`Decrease ${label}`} onClick={onMinus} className="grid h-full w-[44px] place-items-center text-[19px] font-bold">
        -
      </button>
      <div className="tabular flex-1 text-center text-[13.5px] font-medium">{value}</div>
      <button disabled={disabled} aria-label={`Increase ${label}`} onClick={onPlus} className="grid h-full w-[44px] place-items-center text-[19px] font-bold">
        +
      </button>
    </div>
  );
}

function MoneyBox({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled: boolean; label: string }) {
  const [text, setText] = useState(value.toFixed(2));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(value.toFixed(2));
  }, [value, focus]);
  return (
    <div className={cn("flex h-[44px] items-center justify-center rounded-[11px] border border-input", focus && "border-2 border-primary", disabled && "opacity-60")}>
      <span className="text-[15px] font-bold">$</span>
      <input
        aria-label={label}
        disabled={disabled}
        inputMode="decimal"
        value={text}
        onFocus={() => setFocus(true)}
        onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => {
          setFocus(false);
          const n = round2(Math.max(0, Number(text) || 0));
          onChange(n);
          setText(n.toFixed(2));
        }}
        className="tabular w-[80px] bg-transparent text-[15px] font-bold outline-none"
        style={{ width: `${Math.max(3, text.length) + 0.5}ch` }}
      />
    </div>
  );
}

function SignalIcon({ spinning }: { spinning: boolean }) {
  return (
    <span className="relative grid size-[40px] shrink-0 place-items-center rounded-full bg-signal-ring ring-2 ring-primary-foreground/25">
      <svg viewBox="0 0 24 24" className="size-[22px] text-signal" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M5.8 5.8a8.8 8.8 0 0 0 0 12.4M18.2 5.8a8.8 8.8 0 0 1 0 12.4" />
      </svg>
      <span className={cn("absolute inset-[-2px] rounded-full border-2 border-transparent border-t-primary-foreground", spinning && "animate-spin")} />
    </span>
  );
}

function RobotPage() {
  const { state, setRobot, setActive } = useStore();
  const r = state.robot;
  const session = robotSession(state);
  const [phase, setPhase] = useState<"idle" | "searching" | "found">("idle");
  const [winRate, setWinRate] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const analyze = () => {
    if (phase === "searching") return;
    setPhase("searching");
    timer.current = setTimeout(() => {
      const closes = buildHistory(r.symbol, Math.max(5, r.duration), 120).map((c) => c.close);
      const trend = backtestWinRate(closes, "trend");
      const reverse = backtestWinRate(closes, "reverse");
      const strategy = trend >= reverse ? "trend" : "reverse";
      setWinRate(Math.max(trend, reverse));
      setRobot({ strategy });
      setPhase("found");
    }, 2200);
  };

  const locked = r.running;
  const pl = session.pl;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Robot Settings" />
      <div className="flex-1 px-[21px] pt-[14px] pb-[20px] lg:px-[18px] lg:[zoom:1.12]">
        <SectionTitle title="Execution account" sub="Available balance" />
        <AccountSelect value={state.active} onChange={setActive} label="Execution account" suffix=" available" className="h-[58px] rounded-[12px]" />

        <div className="mt-[24px]">
          <SectionTitle title="Order parameters" sub="Applied to each order" />
          <div className="grid grid-cols-2 gap-[13px]">
            <div>
              <div className="mb-[7px] pl-[2px] text-[11.5px] text-muted-foreground">Duration</div>
              <Stepper
                label="duration"
                disabled={locked}
                value={formatDuration(r.duration)}
                onMinus={() => setRobot({ duration: stepValue(DURATIONS, r.duration, -1) })}
                onPlus={() => setRobot({ duration: stepValue(DURATIONS, r.duration, 1) })}
              />
            </div>
            <div>
              <div className="mb-[7px] pl-[2px] text-[11.5px] text-muted-foreground">Stake</div>
              <Stepper
                label="stake"
                disabled={locked}
                value={`$${r.stake}`}
                onMinus={() => setRobot({ stake: stepValue(STAKE_STEPS, r.stake, -1) })}
                onPlus={() => setRobot({ stake: stepValue(STAKE_STEPS, r.stake, 1) })}
              />
            </div>
          </div>
        </div>

        <div className="mt-[24px]">
          <SectionTitle title="Instrument and timing" sub="Strategy routing" />
          <InstrumentPicker robot symbol={r.symbol} disabled={locked} onChange={(symbol) => {
            setRobot({ symbol });
            setPhase("idle");
          }} />
        </div>

        <div className="mt-[17px] rounded-[16px] bg-primary px-[16px] py-[18px] text-primary-foreground">
          <button onClick={analyze} disabled={phase !== "idle"} className="flex w-full items-center gap-[16px] text-left">
            <SignalIcon spinning={phase === "searching"} />
            <span>
              <span className="block text-[16px] font-semibold leading-[20px]">
                {phase === "idle" ? "Tap to search for a signal" : phase === "searching" ? "Searching for a signal.." : "Search for a signal"}
              </span>
              <span className="block text-[12px] leading-[17px] text-primary-foreground/75">
                Indicator: <b className="font-bold text-primary-foreground">RSI</b>
              </span>
            </span>
          </button>
          {phase === "found" && (
            <>
              <div className="mt-[16px] flex h-[35px] items-center justify-between border-b border-primary-foreground/15 text-[14px]">
                <span className="text-primary-foreground/75">Robot</span>
                <span className="font-semibold">{ROBOT_NAMES[r.strategy]}</span>
              </div>
              <div className="flex h-[40px] items-center justify-between border-b border-primary-foreground/15 text-[14px]">
                <span className="text-primary-foreground/75">Win Rate</span>
                <span className="tabular font-semibold">{winRate}%</span>
              </div>
              <button onClick={analyze} className="mt-[11px] h-[45px] w-full rounded-[12px] bg-primary-foreground/20 text-[14px] font-semibold hover:bg-primary-foreground/25">
                Analyze Again
              </button>
            </>
          )}
        </div>

        <div className="mt-[24px]">
          <SectionTitle title="Risk management" sub="Exit guardrails" />
          <div className="grid grid-cols-2 gap-[13px]">
            <div>
              <div className="mb-[7px] pl-[2px] text-[11.5px] text-muted-foreground">Stop loss</div>
              <MoneyBox label="Stop loss" disabled={locked} value={r.stopLoss} onChange={(n) => setRobot({ stopLoss: n })} />
              <div className="mt-[7px] pl-[2px] text-[11px] text-muted-foreground">Limit downside</div>
            </div>
            <div>
              <div className="mb-[7px] pl-[2px] text-[11.5px] text-muted-foreground">Take profit</div>
              <MoneyBox label="Take profit" disabled={locked} value={r.takeProfit} onChange={(n) => setRobot({ takeProfit: n })} />
              <div className="mt-[7px] pl-[2px] text-[11px] text-muted-foreground">Lock gains</div>
            </div>
          </div>
        </div>

        <div className="mt-[17px] rounded-[12px] border border-input px-[15px] py-[4px]">
          {[
            { k: "Status", v: r.running ? "Running" : "Stopped", c: r.running ? "text-success" : "text-muted-foreground" },
            { k: "Trades", v: String(session.trades), c: "" },
            { k: "Profits", v: formatMoney(session.profits), c: "text-success" },
            { k: "Losses", v: String(session.losses), c: "text-destructive" },
          ].map((row) => (
            <div key={row.k} className="flex h-[35px] items-center justify-between border-b border-border text-[12.5px]">
              <span className="text-muted-foreground">{row.k}</span>
              <span className={cn("tabular text-[13.5px] font-semibold", row.c)}>{row.v}</span>
            </div>
          ))}
          <div className="flex h-[35px] items-center justify-between text-[12.5px]">
            <span className="font-semibold">Cumulative P/L</span>
            <span className={cn("tabular text-[13.5px] font-semibold", pl < 0 ? "text-destructive" : "text-success")}>
              {pl < 0 ? "-" : ""}
              {formatMoney(Math.abs(pl))}
            </span>
          </div>
        </div>
        <p className="mt-[10px] text-center text-[10.5px] leading-[15px] text-muted-foreground">
          Practice money only. Win rate is from recent practice prices and does not predict future results.
        </p>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-border bg-background px-[12px] pt-[13px] pb-[16px] lg:px-[20px] lg:pb-[18px]">
        <button
          onClick={() => setRobot({ running: !r.running })}
          className={cn(
            "h-[52px] w-full rounded-full text-[16px] font-bold text-primary-foreground shadow-[0_6px_14px_color-mix(in_oklab,var(--primary)_35%,transparent)]",
            r.running ? "bg-sell" : "bg-primary",
          )}
        >
          {r.running ? "Stop trading" : "Start trading"}
        </button>
      </div>
    </div>
  );
}
