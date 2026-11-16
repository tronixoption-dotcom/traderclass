// Simulated price feed for practice trading. Runs only in the browser.
import { SYMBOLS, getSymbol } from "./symbols";

export type Candle = { time: number; open: number; high: number; low: number; close: number };
type Listener = () => void;

const prices: Record<string, number> = {};
const opens: Record<string, number> = {};
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

function normal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Deterministic starting values so server and browser render the same first frame.
const OPEN_OFFSETS = [0.0053, -0.0007, -0.0029, -0.0023, 0.0011, -0.0078];
SYMBOLS.forEach((s, i) => {
  prices[s.id] = s.base;
  opens[s.id] = s.base * (1 + (OPEN_OFFSETS[i] ?? 0));
});

function tick() {
  for (const s of SYMBOLS) {
    const p = prices[s.id] ?? s.base;
    const drift = (s.base - p) * 0.002;
    prices[s.id] = p + drift + p * s.vol * normal();
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
  return prices[id] ?? getSymbol(id).base;
}

export function getQuote(id: string) {
  const s = getSymbol(id);
  const mid = getPrice(id);
  const bid = mid - s.spread / 2;
  const ask = mid + s.spread / 2;
  const open = opens[id] ?? s.base;
  const change = mid - open;
  return { mid, bid, ask, change, changePct: (change / open) * 100 };
}

/** Builds past candles for a timeframe that end at the current price. */
export function buildHistory(id: string, tfSeconds: number, count = 160): Candle[] {
  const s = getSymbol(id);
  const now = Math.floor(Date.now() / 1000);
  const lastBucket = now - (now % tfSeconds);
  const sigma = s.vol * Math.sqrt(tfSeconds) * 0.35;
  const out: Candle[] = [];
  const anchor = getPrice(id);
  let close = anchor;
  for (let i = 0; i < count; i++) {
    const open = close * (1 - sigma * normal()) + (anchor - close) * 0.04;
    const high = Math.max(open, close) * (1 + Math.abs(normal()) * sigma * 0.5);
    const low = Math.min(open, close) * (1 - Math.abs(normal()) * sigma * 0.5);
    out.push({ time: lastBucket - i * tfSeconds, open, high, low, close });
    close = open;
  }
  return out.reverse();
}
