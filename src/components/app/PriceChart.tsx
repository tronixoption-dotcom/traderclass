import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { IChartApi, IPriceLine, ISeriesApi, SeriesType, UTCTimestamp } from "lightweight-charts";
import { buildPracticeHistory, getPrice, subscribeFeed, type Candle } from "@/lib/feed";
import { getSymbol } from "@/lib/symbols";
import type { Trade } from "@/lib/store";
import { resolveToken } from "./color";
import { getInhouseMarketHistory } from '@/lib/real-trading.functions';
import { hasFreshMarketQuote } from '@/lib/feed';

export type ChartKind = "bars" | "candles" | "hollow" | "line" | "area" | "baseline";
export type Indicators = { ma: boolean; ema: boolean };

/** Handle given to the drawing layer and toolbar once the chart is ready. */
export type ChartApi = {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  bars: () => Candle[];
};

const tz = () => -new Date().getTimezoneOffset() * 60;

function sma(bars: Candle[], end: number, n: number) {
  if (end + 1 < n) return null;
  let s = 0;
  for (let i = end - n + 1; i <= end; i++) s += (bars[i] as Candle).close;
  return s / n;
}

export function PriceChart({
  symbol,
  timeframe,
  kind,
  theme,
  trades,
  indicators,
  onApi,
  desktop = false,
  practice = false,
  marketSource = 'okx',
}: {
  symbol: string;
  timeframe: number;
  kind: ChartKind;
  theme: string;
  trades: Trade[];
  indicators: Indicators;
  onApi?: (api: ChartApi | null) => void;
  desktop?: boolean;
  practice?: boolean;
  marketSource?: 'okx' | 'inhouse';
}) {
  const loadMarketHistory = useServerFn(getInhouseMarketHistory);
  const el = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const tradesRef = useRef(trades);
  tradesRef.current = trades;
  const onApiRef = useRef(onApi);
  onApiRef.current = onApi;
  const colorsRef = useRef({ buy: "", sell: "" });

  const syncLines = () => {
    const series = seriesRef.current;
    if (!series) return;
    linesRef.current.forEach((l) => series.removePriceLine(l));
    const c = colorsRef.current;
    linesRef.current = tradesRef.current
      .filter((t) => t.status === "active" && t.symbol === symbol)
      .map((t) =>
        series.createPriceLine({
          price: t.entry,
          color: t.direction === "buy" ? c.buy : c.sell,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${t.direction.toUpperCase()} $${t.stake}`,
        }),
      );
  };

  useEffect(() => {
    let chart: IChartApi | null = null;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const lc = await import("lightweight-charts");
      if (cancelled || !el.current) return;
      const c = {
        bg: resolveToken("--background"),
        fg: resolveToken("--tv-foreground"),
        grid: resolveToken("--border", 0.9),
        up: resolveToken("--candle-up"),
        down: resolveToken("--candle-down"),
        buy: resolveToken("--buy"),
        sell: resolveToken("--sell"),
        areaTop: resolveToken("--primary", 0.28),
        areaBottom: resolveToken("--primary", 0.02),
        line: resolveToken("--primary"),
        ma: resolveToken("--amber"),
        ema: resolveToken("--chart-3"),
      };
      colorsRef.current = c;
      const info = getSymbol(symbol);
      // Select density from the workspace mode, not the space left after its sidebars.
      const wide = desktop;
      const visibleBars = Math.min(175, Math.max(55, Math.floor(el.current.clientWidth / 5)));
      // The reference chart shows one more decimal than the trade buttons (3,864.300).
      const precision = info.decimals + 1;
      const fmt = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
      chart = lc.createChart(el.current, {
        autoSize: true,
        layout: {
          background: { type: lc.ColorType.Solid, color: c.bg },
          textColor: c.fg,
          fontFamily: "Roboto, sans-serif",
          fontSize: wide ? 13.5 : 12,
          attributionLogo: false,
        },
        localization: { priceFormatter: fmt },
        grid: {
          vertLines: { color: c.grid, style: lc.LineStyle.Dotted },
          horzLines: { color: c.grid, style: lc.LineStyle.Dotted },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: timeframe < 60, rightOffset: 10, barSpacing: 10 },
        crosshair: { mode: lc.CrosshairMode.Normal },
      });

      const priceFormat = { type: "price" as const, precision, minMove: 1 / 10 ** precision };
      let series: ISeriesApi<SeriesType>;
      let history: Candle[];
      if (practice) history = buildPracticeHistory(symbol, timeframe, wide ? 320 : 160);
      else try {
        const rows = await loadMarketHistory({ data: { symbol, limit: 300, timeframe, source: marketSource } });
        const grouped = new Map<number, Candle>();
        for (const row of rows) {
          const bucket = row.time - (row.time % timeframe);
          const open = 'open' in row ? row.open : row.price;
          const high = 'high' in row ? row.high : row.price;
          const low = 'low' in row ? row.low : row.price;
          const close = 'close' in row ? row.close : row.price;
          const current = grouped.get(bucket);
          if (!current) grouped.set(bucket, { time: bucket, open, high, low, close });
          else grouped.set(bucket, { ...current, high: Math.max(current.high, high), low: Math.min(current.low, low), close });
        }
        history = [...grouped.values()].slice(-(wide ? 320 : 160));
      } catch { history = []; }
      if (cancelled || !el.current) { chart.remove(); return; }
      if (kind === "area") {
        series = chart.addSeries(lc.AreaSeries, { lineColor: c.line, topColor: c.areaTop, bottomColor: c.areaBottom, lineWidth: 2, priceFormat, priceLineColor: c.up, priceLineStyle: lc.LineStyle.Dotted });
      } else if (kind === "line") {
        series = chart.addSeries(lc.LineSeries, { color: c.line, lineWidth: 2, priceFormat, priceLineColor: c.up, priceLineStyle: lc.LineStyle.Dotted });
      } else if (kind === "baseline") {
        series = chart.addSeries(lc.BaselineSeries, {
          baseValue: { type: "price", price: history[0]?.close ?? (Number.isFinite(getPrice(symbol)) ? getPrice(symbol) : 1) },
          topLineColor: c.up,
          bottomLineColor: c.down,
          priceFormat,
          priceLineStyle: lc.LineStyle.Dotted,
        });
      } else {
        const hollow = kind === "hollow";
        series = chart.addSeries(kind === "bars" ? lc.BarSeries : lc.CandlestickSeries, {
          upColor: hollow ? "rgba(0,0,0,0)" : c.up,
          downColor: c.down,
          borderVisible: hollow,
          borderUpColor: c.up,
          borderDownColor: c.down,
          wickUpColor: c.up,
          wickDownColor: c.down,
          priceFormat,
          priceLineColor: c.up,
          priceLineStyle: lc.LineStyle.Dotted,
        });
      }
      seriesRef.current = series;

      const off = tz();
      const single = kind === "area" || kind === "line" || kind === "baseline";
      const toPoint = (k: Candle) =>
        single
          ? { time: (k.time + off) as UTCTimestamp, value: k.close }
          : { time: (k.time + off) as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close };

      const bars = [...history];
      series.setData(bars.map(toPoint));

      // Moving averages
      const maSeries = indicators.ma ? chart.addSeries(lc.LineSeries, { color: c.ma, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }) : null;
      const emaSeries = indicators.ema ? chart.addSeries(lc.LineSeries, { color: c.ema, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }) : null;
      const emaK = 2 / (50 + 1);
      const emaVals: number[] = [];
      bars.forEach((b, i) => emaVals.push(i === 0 ? b.close : b.close * emaK + (emaVals[i - 1] as number) * (1 - emaK)));
      if (maSeries)
        maSeries.setData(
          bars.flatMap((b, i) => {
            const v = sma(bars, i, 20);
            return v === null ? [] : [{ time: (b.time + off) as UTCTimestamp, value: v }];
          }),
        );
      if (emaSeries) emaSeries.setData(bars.map((b, i) => ({ time: (b.time + off) as UTCTimestamp, value: emaVals[i] as number })).slice(10));

      chart.timeScale().setVisibleLogicalRange(wide ? { from: bars.length - visibleBars, to: bars.length + 14 } : { from: bars.length - 17, to: bars.length + 9 });
      syncLines();
      onApiRef.current?.({ chart, series, bars: () => bars });

      unsub = subscribeFeed(() => {
        if (!hasFreshMarketQuote(symbol)) return;
        const price = getPrice(symbol);
        if (!Number.isFinite(price)) return;
        const now = Math.floor(Date.now() / 1000);
        const bucket = now - (now % timeframe);
        const last = bars[bars.length - 1];
        let cur: Candle;
        if (!last) {
          cur = { time: bucket, open: price, high: price, low: price, close: price };
          bars.push(cur);
          emaVals.push(price);
        } else if (bucket > last.time) {
          cur = { time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price };
          bars.push(cur);
          emaVals.push(price * emaK + (emaVals[emaVals.length - 1] as number) * (1 - emaK));
        } else {
          cur = { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price };
          bars[bars.length - 1] = cur;
          emaVals[emaVals.length - 1] = price * emaK + (emaVals[emaVals.length - 2] ?? price) * (1 - emaK);
        }
        series.update(toPoint(cur));
        const t = (cur.time + off) as UTCTimestamp;
        const ma = sma(bars, bars.length - 1, 20);
        if (maSeries && ma !== null) maSeries.update({ time: t, value: ma });
        if (emaSeries) emaSeries.update({ time: t, value: emaVals[emaVals.length - 1] as number });
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
      onApiRef.current?.(null);
      linesRef.current = [];
      seriesRef.current = null;
      chart?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, kind, theme, indicators.ma, indicators.ema, desktop, practice, marketSource, loadMarketHistory]);

  const activeKey = trades
    .filter((t) => t.status === "active" && t.symbol === symbol)
    .map((t) => t.id)
    .join(",");
  useEffect(() => {
    syncLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return <div ref={el} className="absolute inset-0" />;
}
