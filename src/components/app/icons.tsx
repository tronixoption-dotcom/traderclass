import type { SVGProps } from "react";
import { cn } from "@/lib/utils";
import type { AccountId } from "@/lib/trading";
import { getSymbol } from "@/lib/symbols";

type IconProps = { className?: string | undefined };

/** Round US flag, as shown on the account pickers. */
export function USFlag({ className }: IconProps) {
  const stripes = Array.from({ length: 13 }, (_, i) => i);
  return (
    <svg viewBox="0 0 40 40" className={cn("size-[29px] shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id="usflag-c">
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>
      <g clipPath="url(#usflag-c)">
        {stripes.map((i) => (
          <rect key={i} x="0" y={(i * 40) / 13} width="40" height={40 / 13 + 0.2} fill={i % 2 ? "#ffffff" : "#e8313d"} />
        ))}
        <rect x="0" y="0" width="20" height={(7 * 40) / 13} fill="#3a3b8f" />
        {[0, 1, 2, 3, 4].map((r) =>
          [0, 1, 2, 3].map((c) => <circle key={`${r}${c}`} cx={3 + c * 4.6 + (r % 2) * 2.3} cy={2.6 + r * 4.2} r="0.9" fill="#ffffff" />),
        )}
      </g>
    </svg>
  );
}

/** Tether (USDT) coin. */
export function TetherIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-[29px] shrink-0", className)} aria-hidden>
      <circle cx="20" cy="20" r="20" fill="var(--tether)" />
      <path d="M12.5 11h15l4.5 6.2L20 30.5 8 17.2z" fill="#ffffff" />
      <path d="M14.3 14.2h11.4v2.4h-4.4v1.6c2.6.15 4.4.6 4.4 1.15s-1.8 1-4.4 1.15V25h-2.6v-4.5c-2.6-.15-4.4-.6-4.4-1.15s1.8-1 4.4-1.15v-1.6h-4.4z" fill="var(--tether)" />
      <path d="M15.4 19.35c.8.4 2.6.65 4.6.65s3.8-.25 4.6-.65" stroke="#ffffff" strokeWidth=".7" fill="none" />
    </svg>
  );
}

export function AccountIcon({ account, className }: { account: AccountId; className?: string }) {
  return account === "USDT" ? <TetherIcon className={className} /> : <USFlag className={className} />;
}

function GoldBars() {
  return (
    <svg viewBox="0 0 20 20" className="size-full" aria-hidden>
      <circle cx="10" cy="10" r="10" fill="var(--gold)" />
      <path d="M7.6 6.2h4.8l1.1 2.9H6.5z M4.6 9.9h4.8l1.1 2.9H3.5z M10.6 9.9h4.8l1.1 2.9H9.5z" fill="#ffffff" />
    </svg>
  );
}

export function SymbolIcon({ symbol, className }: { symbol: string; className?: string }) {
  const s = getSymbol(symbol);
  if (s.icon === "gold")
    return (
      <span className={cn("block size-[18.5px] shrink-0", className)}>
        <GoldBars />
      </span>
    );
  return (
    <span
      className={cn(
        "grid size-[18.5px] shrink-0 place-items-center rounded-full text-[8px] font-bold",
        s.icon === "btc" && "bg-chart-1 text-primary-foreground",
        s.icon === "fx" && "bg-primary-soft text-primary",
        className,
      )}
    >
      {s.short}
    </span>
  );
}

/* ---------- Bottom menu icons ---------- */

export function NavMarketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="2.5" y="11" width="5" height="11" rx="2.5" />
      <rect x="9.5" y="3" width="5" height="19" rx="2.5" />
      <rect x="16.5" y="7" width="5" height="15" rx="2.5" />
    </svg>
  );
}

export function NavRobotIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden>
      <path d="M1.5 5h21M1.5 12h21M1.5 19h21" />
      <circle cx="14" cy="5" r="2.7" fill="var(--nav)" />
      <circle cx="9" cy="12" r="2.7" fill="var(--nav)" />
      <circle cx="10.5" cy="19" r="2.7" fill="var(--nav)" />
    </svg>
  );
}

export function TradesIcon({ className }: IconProps) {
  const dots = [
    [18.1, 4.2], [22.6, 4.2],
    [13.6, 8.9], [18.1, 8.9], [22.6, 8.9],
    [9.2, 13.6], [13.6, 13.6], [18.1, 13.6], [22.6, 13.6],
    [4.8, 18.4], [9.2, 18.4], [13.6, 18.4], [18.1, 18.4], [22.6, 18.4],
  ];
  return (
    <svg viewBox="0 0 24 21" className={className} fill="currentColor" aria-hidden>
      <path d="M1.2 12.2 10.6 3.4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" fill="none" />
      <path d="M13.4 .8 6.6 1.3l6.2 6z" />
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.65" />
      ))}
    </svg>
  );
}

export function NavSupportIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.8c5.3 0 9.5 3.6 9.5 8.1S17.3 19 12 19c-1 0-2-.1-2.9-.4L4.2 21l1.1-4.2C3.5 15.3 2.5 13.2 2.5 11 2.5 6.4 6.7 2.8 12 2.8Z" />
      <circle cx="7.8" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.2" cy="11" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function NavAccountIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="9.6" r="3.4" />
      <path d="M5.6 19.2c1.3-2.4 3.7-3.8 6.4-3.8s5.1 1.4 6.4 3.8" />
    </svg>
  );
}

/* ---------- TradingView-style chart icons (thin 1px strokes) ---------- */

function Tv(props: SVGProps<SVGSVGElement> & { children: React.ReactNode }) {
  const { children, className, ...rest } = props;
  return (
    <svg
      viewBox="0 0 28 28"
      className={cn("size-7", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ToolIcons = {
  cross: () => (
    <Tv>
      <path d="M14 3.5v8M14 16.5v8M3.5 14h8M16.5 14h8" strokeWidth="1.2" />
    </Tv>
  ),
  trend: () => (
    <Tv>
      <path d="M7.4 20.6 20.6 7.4" />
      <circle cx="6" cy="22" r="2" />
      <circle cx="22" cy="6" r="2" />
    </Tv>
  ),
  fib: () => (
    <Tv>
      <path d="M4 6.5h20M4 11h15.5M4 15.5h20M8 20h16" />
      <circle cx="21.5" cy="11" r="2" />
      <circle cx="6" cy="20" r="2" />
    </Tv>
  ),
  pattern: () => (
    <Tv>
      <path d="M6.5 20.5 9 8.5l11 12.5 2-12.5M9 8.5l5 6 5.5-6" />
      <circle cx="6" cy="22" r="1.8" />
      <circle cx="9" cy="7" r="1.8" />
      <circle cx="14" cy="14.5" r="1.8" />
      <circle cx="20" cy="7" r="1.8" />
      <circle cx="22" cy="22" r="1.8" />
    </Tv>
  ),
  position: () => (
    <Tv>
      <path d="M8 6.5h16M4 14.5h20M8 22.5h16M11 9v4M11 9h3.5" />
      <circle cx="6" cy="6.5" r="2" />
      <circle cx="6" cy="22.5" r="2" />
      <path d="M12 9.5v3.5h3" strokeWidth="1.3" />
    </Tv>
  ),
  brush: () => (
    <Tv>
      <path d="M4 22.5c2.5 0 3.5-1 4.5-3.5.8-2 2.4-3 4.2-2.3 1.6.6 2 2.7.8 4.2-1.6 2-5.6 2.3-9.5 1.6Z" />
      <path d="m13.2 16.9 5.3-6.3M19 17.5l2.2-2.6c1-1.2 2.2-1.6 3.3-1.4" />
    </Tv>
  ),
  text: () => (
    <Tv>
      <path d="M7 6.5h14M14 6.5v16M11.5 22.5h5M7 6.5v2M21 6.5v2" />
    </Tv>
  ),
  emoji: () => (
    <Tv>
      <circle cx="14" cy="14" r="9.5" />
      <path d="M10 16.5c1 1.4 2.4 2.1 4 2.1s3-.7 4-2.1" />
      <circle cx="10.8" cy="11.5" r=".9" fill="currentColor" />
      <circle cx="17.2" cy="11.5" r=".9" fill="currentColor" />
    </Tv>
  ),
  ruler: () => (
    <Tv>
      <path d="M3.8 18.5 18.5 3.8l5.7 5.7L9.5 24.2z" />
      <path d="m7.6 14.7 1.8 1.8M10.1 12.2l2.6 2.6M12.6 9.7l1.8 1.8M15.1 7.2l2.6 2.6M17.6 4.7l1.8 1.8" />
    </Tv>
  ),
  zoom: () => (
    <Tv>
      <circle cx="12.5" cy="12.5" r="8.5" />
      <path d="m18.7 18.7 5.3 5.3M12.5 8.5v8M8.5 12.5h8" />
    </Tv>
  ),
  magnet: () => (
    <Tv>
      <path d="M7 16V12a7 7 0 0 1 14 0v4M7 16v6h4.5v-6M21 16v6h-4.5v-6M11.5 16v-4a2.5 2.5 0 0 1 5 0v4M7 19h4.5M16.5 19H21" />
    </Tv>
  ),
  eye: () => (
    <Tv>
      <path d="M3 14c2.8-4.7 6.5-7 11-7s8.2 2.3 11 7c-2.8 4.7-6.5 7-11 7S5.8 18.7 3 14Z" />
      <circle cx="14" cy="14" r="3.5" />
    </Tv>
  ),
  trash: () => (
    <Tv>
      <path d="M5 8h18M11 8V5.5h6V8M7.5 8l1.2 15h10.6l1.2-15M12 12v7M16 12v7" />
    </Tv>
  ),
};

export const ChartTypeIcons = {
  bars: () => (
    <Tv>
      <path d="M9.5 6v17M9.5 9H6.5M9.5 19h3M18.5 4v16M18.5 7h-3M18.5 16h3" strokeWidth="1.2" />
    </Tv>
  ),
  candles: () => (
    <Tv>
      <path d="M9 4v4M9 21v4M19 5v5M19 18v4" />
      <rect x="6.5" y="8" width="5" height="13" rx=".5" />
      <rect x="16.5" y="10" width="5" height="8" rx=".5" />
    </Tv>
  ),
  hollow: () => (
    <Tv>
      <path d="M9 4v4M9 21v4M19 5v5M19 18v4" />
      <rect x="6.5" y="8" width="5" height="13" rx=".5" strokeDasharray="2 1.5" />
      <rect x="16.5" y="10" width="5" height="8" rx=".5" />
    </Tv>
  ),
  line: () => (
    <Tv>
      <path d="m4 20 6-7 4.5 4.5L24 7" strokeWidth="1.2" />
    </Tv>
  ),
  area: () => (
    <Tv>
      <defs>
        <pattern id="tv-hatch" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="currentColor" />
          <rect x="1" y="1" width="1" height="1" fill="currentColor" />
        </pattern>
      </defs>
      <path d="M3.5 22.5 10 14l4.5 4L24.5 8v14.5z" fill="url(#tv-hatch)" stroke="none" />
      <path d="M3.5 21 10 12.5l4.5 4 10-10" strokeWidth="1.4" />
    </Tv>
  ),
  baseline: () => (
    <Tv>
      <path d="M3.5 14h21" strokeDasharray="2 2" />
      <path d="m4 18 5-6 4 3 5-8 6 5" strokeWidth="1.2" />
    </Tv>
  ),
};

export const ToolbarIcons = {
  plusCircle: () => (
    <Tv>
      <circle cx="14" cy="14" r="9.5" strokeWidth="1.2" />
      <path d="M14 9v10M9 14h10" strokeWidth="1.2" />
    </Tv>
  ),
  indicators: () => (
    <Tv>
      <path d="M4 22c3-1 4.5-4 6.5-8s4-6 6-6 3 2 4 4 2 3 3.5 3" />
      <path d="M4 18.5h3M21 23.5V20M21 23.5h3.5" />
    </Tv>
  ),
  camera: () => (
    <Tv>
      <path d="M4.5 9.5h4l2-3h7l2 3h4v12.5h-19z" />
      <circle cx="14" cy="15.5" r="4" />
    </Tv>
  ),
  fullscreen: () => (
    <Tv>
      <path d="M5 11V5h6M17 5h6v6M23 17v6h-6M11 23H5v-6" strokeWidth="1.2" />
    </Tv>
  ),
};

/** TradingView mark, linked as required by the chart library's licence. */
export function TVMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 35 19" className={className} aria-hidden>
      <path d="M14 2H2v6h6v9h6V2Zm12 15h-7l6-15h7l-6 15Zm-7-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="currentColor" />
    </svg>
  );
}

import logoAsset from "../../assets/traderclass-logo.jpeg.asset.json";

export function Logo({ className }: { className?: string }) {
  return <img src={logoAsset.url} alt="TraderClass" className={cn("h-12 w-auto rounded-md", className)} />;
}
