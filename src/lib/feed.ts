// Shared in-house quote cache used by the chart and trade panels.
import { SYMBOLS, getSymbol } from './symbols';
export type Candle = { time: number; open: number; high: number; low: number; close: number };
type Listener = () => void;

const marketQuotes: Record<string, { mid: number; bid: number; ask: number; timestamp: number; open: number }> = {};
const practicePrices: Record<string, number> = Object.fromEntries(SYMBOLS.map((symbol) => [symbol.id, symbol.base]));
const practiceOpens: Record<string, number> = Object.fromEntries(SYMBOLS.map((symbol, index) => [symbol.id, symbol.base * (1 + ([0.0053, -0.0007, -0.0029, -0.0023, 0.0011, -0.0078][index] ?? 0))]));
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  for (const symbol of SYMBOLS) {
    const price = practicePrices[symbol.id] ?? symbol.base;
    const u = Math.max(Number.EPSILON, Math.random());
    const v = Math.max(Number.EPSILON, Math.random());
    const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const drift = (symbol.base - price) * 0.002;
    practicePrices[symbol.id] = Math.max(Number.EPSILON, price + drift + price * symbol.vol * normal);
  }
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
  return live?.mid ?? getPracticePrice(id);
}

export function getPracticePrice(id: string): number {
  return practicePrices[id] ?? getSymbol(id).base;
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
  if (live) {
    const change = live.mid - live.open;
    return { mid: live.mid, bid: live.bid, ask: live.ask, change, changePct: (change / live.open) * 100 };
  }
  const symbol = getSymbol(id);
  const mid = getPracticePrice(id);
  const open = practiceOpens[id] ?? symbol.base;
  const change = mid - open;
  return { mid, bid: mid - symbol.spread / 2, ask: mid + symbol.spread / 2, change, changePct: (change / open) * 100 };
}

/** Builds past candles for a timeframe that end at the current price. */
export function buildPracticeHistory(id: string, tfSeconds: number, count = 160): Candle[] {
  const symbol = getSymbol(id);
  const now = Math.floor(Date.now() / 1000);
  const lastBucket = now - now % tfSeconds;
  const anchor = getPracticePrice(id);
  const sigma = symbol.vol * Math.sqrt(tfSeconds) * 0.35;
  let close = anchor;
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = close * (1 + (Math.random() * 2 - 1) * sigma) + (anchor - close) * 0.04;
    const spread = Math.abs(close - open) + anchor * sigma * Math.random();
    out.push({ time: lastBucket - i * tfSeconds, open, high: Math.max(open, close) + spread, low: Math.max(Number.EPSILON, Math.min(open, close) - spread), close });
    close = open;
  }
  return out.reverse();
}
