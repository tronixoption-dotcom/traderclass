// Shared in-house quote cache used by the chart and trade panels.
export type Candle = { time: number; open: number; high: number; low: number; close: number };
type Listener = () => void;

const marketQuotes: Record<string, { mid: number; bid: number; ask: number; timestamp: number; open: number }> = {};
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  listeners.forEach((l) => l());
}

export function startFeed() {
  if (timer || typeof window === "undefined") return;
  timer = setInterval(tick, 1000);
}

export function subscribeFeed(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getPrice(id: string): number {
  const live = marketQuotes[id];
  return live && Date.now() - live.timestamp <= 5000 ? live.mid : Number.NaN;
}

export function setMarketQuote(id: string, mid: number, bid: number, ask: number, timestamp: number) {
  if (![mid, bid, ask, timestamp].every(Number.isFinite) || mid <= 0 || bid <= 0 || ask <= 0 || timestamp > Date.now() + 1000 || Date.now() - timestamp > 5000) return;
  marketQuotes[id] = { mid, bid, ask, timestamp, open: marketQuotes[id]?.open ?? mid };
  listeners.forEach((listener) => listener());
}

export function clearMarketQuote(id: string) {
  delete marketQuotes[id];
  listeners.forEach((listener) => listener());
}

export function hasFreshMarketQuote(id: string) {
  const quote = marketQuotes[id];
  return !!quote && Date.now() - quote.timestamp <= 5000;
}

export function getQuote(id: string) {
  const live = marketQuotes[id];
  if (!live || Date.now() - live.timestamp > 5000) return { mid: Number.NaN, bid: Number.NaN, ask: Number.NaN, change: 0, changePct: 0 };
  const change = live.mid - live.open;
  return { mid: live.mid, bid: live.bid, ask: live.ask, change, changePct: (change / live.open) * 100 };
}

/** Builds past candles for a timeframe that end at the current price. */
