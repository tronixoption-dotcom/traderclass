import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { Logical } from "lightweight-charts";
import { subscribeFeed } from "@/lib/feed";
import type { ChartApi } from "./PriceChart";

export type Tool = "cross" | "trend" | "fib" | "pattern" | "position" | "brush" | "text" | "emoji" | "ruler" | "zoom";
type Pt = { l: number; p: number };
export type Drawing = { id: string; kind: Exclude<Tool, "cross" | "zoom">; pts: Pt[]; text?: string };

const NEEDS: Partial<Record<Tool, number>> = { trend: 2, fib: 2, position: 2, ruler: 2, zoom: 2, pattern: 5 };
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ["#787b86", "#f23645", "#ff9800", "#4caf50", "#089981", "#00bcd4", "#787b86"];

let seq = 0;
const nid = () => `d${Date.now().toString(36)}${seq++}`;

export function ChartDrawings({
  api,
  tool,
  onToolDone,
  drawings,
  setDrawings,
  magnet,
  hidden,
  emoji,
  decimals,
}: {
  api: ChartApi | null;
  tool: Tool;
  onToolDone: () => void;
  drawings: Drawing[];
  setDrawings: (fn: (d: Drawing[]) => Drawing[]) => void;
  magnet: boolean;
  hidden: boolean;
  emoji: string;
  decimals: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [zoomDraft, setZoomDraft] = useState<Pt[] | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  // Redraw when the chart scrolls, zooms, resizes or prices move.
  useEffect(() => {
    if (!api) return;
    let raf = 0;
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => force((n) => n + 1));
    };
    api.chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    api.chart.subscribeCrosshairMove(redraw);
    const off = subscribeFeed(redraw);
    window.addEventListener("resize", redraw);
    return () => {
      cancelAnimationFrame(raf);
      try {
        api.chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);
        api.chart.unsubscribeCrosshairMove(redraw);
      } catch {
        /* chart already removed */
      }
      off();
      window.removeEventListener("resize", redraw);
    };
  }, [api]);

  useEffect(() => {
    setDraft(null);
    setZoomDraft(null);
  }, [tool]);

  if (!api) return null;
  const ts = api.chart.timeScale();
  const X = (l: number) => ts.logicalToCoordinate(l as Logical) ?? -9999;
  const Y = (p: number) => api.series.priceToCoordinate(p) ?? -9999;
  const fmt = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const toPt = (e: RPointerEvent): Pt | null => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return null;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let l = ts.coordinateToLogical(x) as number | null;
    let p = api.series.coordinateToPrice(y) as number | null;
    if (l === null || p === null) return null;
    if (magnet) {
      const bars = api.bars();
      const bar = bars[Math.max(0, Math.min(bars.length - 1, Math.round(l)))];
      if (bar) {
        l = Math.round(l);
        const cands = [bar.open, bar.high, bar.low, bar.close];
        p = cands.reduce((a, b) => (Math.abs(b - (p as number)) < Math.abs(a - (p as number)) ? b : a));
      }
    }
    return { l, p };
  };

  const finish = (d: Drawing) => {
    setDrawings((all) => [...all, d]);
    setDraft(null);
    onToolDone();
  };

  const finishZoom = (pts: Pt[]) => {
    const [a, b] = pts as [Pt, Pt];
    if (Math.abs(a.l - b.l) > 1) ts.setVisibleLogicalRange({ from: Math.min(a.l, b.l), to: Math.max(a.l, b.l) });
    setZoomDraft(null);
    onToolDone();
  };

  const onDown = (e: RPointerEvent) => {
    const pt = toPt(e);
    if (!pt) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY };
    if (tool === "text") {
      const text = window.prompt("Text");
      if (text?.trim()) finish({ id: nid(), kind: "text", pts: [pt], text: text.trim() });
      else onToolDone();
      return;
    }
    if (tool === "emoji") return finish({ id: nid(), kind: "emoji", pts: [pt], text: emoji });
    if (tool === "brush") return setDraft({ id: nid(), kind: "brush", pts: [pt] });
    if (tool === "zoom") {
      if (!zoomDraft) setZoomDraft([pt, pt]);
      else finishZoom([zoomDraft[0] as Pt, pt]);
      return;
    }
    const need = NEEDS[tool] ?? 2;
    if (!draft) {
      setDraft({ id: nid(), kind: tool as Drawing["kind"], pts: [pt, pt] });
      return;
    }
    const pts = [...draft.pts.slice(0, -1), pt];
    if (pts.length >= need) finish({ ...draft, pts });
    else setDraft({ ...draft, pts: [...pts, pt] });
  };

  const onMove = (e: RPointerEvent) => {
    const pt = toPt(e);
    if (!pt) return;
    if (tool === "zoom" && zoomDraft) return setZoomDraft([zoomDraft[0] as Pt, pt]);
    if (!draft) return;
    if (draft.kind === "brush") {
      if (down.current) setDraft({ ...draft, pts: [...draft.pts, pt] });
      return;
    }
    setDraft({ ...draft, pts: [...draft.pts.slice(0, -1), pt] });
  };

  const onUp = (e: RPointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8;
    if (draft?.kind === "brush") {
      if (draft.pts.length > 1) finish(draft);
      else setDraft(null);
      return;
    }
    // Drag gesture finishes two-point tools on touch screens.
    if (moved && tool === "zoom" && zoomDraft) return finishZoom(zoomDraft);
    if (moved && draft && (NEEDS[draft.kind] ?? 2) === 2) {
      const pt = toPt(e);
      if (pt) finish({ ...draft, pts: [draft.pts[0] as Pt, pt] });
    }
  };

  const shown = hidden ? [] : drawings;
  const all = draft ? [...shown, draft] : shown;

  return (
    <div
      ref={box}
      className="absolute inset-0 z-[5]"
      style={{ pointerEvents: tool === "cross" ? "none" : "auto", cursor: tool === "cross" ? undefined : "crosshair", touchAction: tool === "cross" ? undefined : "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        {all.map((d) => (
          <DrawingShape key={d.id} d={d} X={X} Y={Y} fmt={fmt} />
        ))}
        {zoomDraft && (
          <rect
            x={Math.min(X(zoomDraft[0]!.l), X(zoomDraft[1]!.l))}
            y={0}
            width={Math.abs(X(zoomDraft[1]!.l) - X(zoomDraft[0]!.l))}
            height="100%"
            fill="var(--primary)"
            opacity={0.12}
          />
        )}
      </svg>
    </div>
  );
}

function DrawingShape({ d, X, Y, fmt }: { d: Drawing; X: (l: number) => number; Y: (p: number) => number; fmt: (p: number) => string }) {
  const blue = "#2962ff";
  const pts = d.pts.map((p) => ({ x: X(p.l), y: Y(p.p) }));
  const [a, b] = pts;
  switch (d.kind) {
    case "trend":
      return (
        <g>
          <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} stroke={blue} strokeWidth={2} />
          <circle cx={a!.x} cy={a!.y} r={3} fill="#fff" stroke={blue} />
          <circle cx={b!.x} cy={b!.y} r={3} fill="#fff" stroke={blue} />
        </g>
      );
    case "fib": {
      const [p0, p1] = d.pts as [Pt, Pt];
      const x1 = Math.min(a!.x, b!.x);
      const x2 = Math.max(a!.x, b!.x);
      return (
        <g>
          {FIB.map((f, i) => {
            const price = p1.p + (p0.p - p1.p) * f;
            const y = Y(price);
            const next = FIB[i + 1];
            return (
              <g key={f}>
                {next !== undefined && (
                  <rect x={x1} y={Math.min(y, Y(p1.p + (p0.p - p1.p) * next))} width={x2 - x1} height={Math.abs(Y(p1.p + (p0.p - p1.p) * next) - y)} fill={FIB_COLORS[i + 1]} opacity={0.12} />
                )}
                <line x1={x1} x2={x2} y1={y} y2={y} stroke={FIB_COLORS[i]} strokeWidth={1} />
                <text x={x1 - 4} y={y + 3.5} textAnchor="end" fontSize={10} fill={FIB_COLORS[i]}>
                  {f} ({fmt(price)})
                </text>
              </g>
            );
          })}
          <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} stroke="#787b86" strokeDasharray="4 3" />
        </g>
      );
    }
    case "pattern": {
      const labels = ["X", "A", "B", "C", "D"];
      const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
      return (
        <g>
          {pts.length >= 3 && <polygon points={pts.slice(0, 3).map((p) => `${p.x},${p.y}`).join(" ")} fill={blue} opacity={0.15} />}
          {pts.length >= 5 && <polygon points={pts.slice(2, 5).map((p) => `${p.x},${p.y}`).join(" ")} fill={blue} opacity={0.15} />}
          <polyline points={poly} fill="none" stroke={blue} strokeWidth={2} />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill="#fff" stroke={blue} />
              <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={blue}>
                {labels[i]}
              </text>
            </g>
          ))}
        </g>
      );
    }
    case "position": {
      const [p0, p1] = d.pts as [Pt, Pt];
      const stop = p0.p - (p1.p - p0.p);
      const x1 = Math.min(a!.x, b!.x);
      const w = Math.max(24, Math.abs(b!.x - a!.x));
      const yE = Y(p0.p);
      const yT = Y(p1.p);
      const yS = Y(stop);
      const pct = ((p1.p - p0.p) / p0.p) * 100;
      return (
        <g>
          <rect x={x1} y={Math.min(yE, yT)} width={w} height={Math.abs(yT - yE)} fill="#089981" opacity={0.2} />
          <rect x={x1} y={Math.min(yE, yS)} width={w} height={Math.abs(yS - yE)} fill="#f23645" opacity={0.2} />
          <line x1={x1} x2={x1 + w} y1={yE} y2={yE} stroke="#787b86" />
          <text x={x1 + 4} y={yT + (yT < yE ? 12 : -4)} fontSize={10} fill="#089981">
            Target {fmt(p1.p)} ({pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%)
          </text>
          <text x={x1 + 4} y={yS + (yS > yE ? -4 : 12)} fontSize={10} fill="#f23645">
            Stop {fmt(stop)}
          </text>
        </g>
      );
    }
    case "brush":
      return <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
    case "text":
      return (
        <text x={a!.x} y={a!.y} fontSize={14} fill={blue}>
          {d.text}
        </text>
      );
    case "emoji":
      return (
        <text x={a!.x} y={a!.y} fontSize={22} textAnchor="middle" dominantBaseline="central">
          {d.text}
        </text>
      );
    case "ruler": {
      const [p0, p1] = d.pts as [Pt, Pt];
      const diff = p1.p - p0.p;
      const pct = (diff / p0.p) * 100;
      const n = Math.round(Math.abs((p1.l as number) - (p0.l as number)));
      const up = diff >= 0;
      const col = up ? "#2962ff" : "#f23645";
      const x = Math.min(a!.x, b!.x);
      const y = Math.min(a!.y, b!.y);
      const w = Math.abs(b!.x - a!.x);
      const h = Math.abs(b!.y - a!.y);
      const label = `${up ? "+" : "−"}${fmt(Math.abs(diff))} (${up ? "+" : "−"}${Math.abs(pct).toFixed(2)}%) · ${n} bars`;
      const ly = up ? y - 26 : y + h + 4;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill={col} opacity={0.15} />
          <line x1={a!.x} y1={a!.y} x2={b!.x} y2={b!.y} stroke={col} strokeDasharray="3 3" />
          <rect x={x + w / 2 - 78} y={ly} width={156} height={22} rx={4} fill={col} />
          <text x={x + w / 2} y={ly + 15} textAnchor="middle" fontSize={11} fill="#fff">
            {label}
          </text>
        </g>
      );
    }
  }
}
