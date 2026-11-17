// Shared stake and payout rules used by the live trading interface.

export type Direction = "buy" | "sell";
export type AccountId = "USD" | "USDT";
export type TradeStatus = "active" | "won" | "lost" | "draw";

/** A winning trade returns the stake times this number (e.g. $5 stake pays $8.50). */
export const PAYOUT_MULTIPLIER = 1.7;
export const STARTING_BALANCE = 10_000;
export const MIN_TRANSFER = 1;
export const MIN_STAKE = 1;
export const MAX_TOP_UP = 100_000;

export const DURATIONS = [5, 10, 15, 30, 60, 120, 300] as const;
export const STAKE_STEPS = [1, 2, 5, 10, 20, 50, 100, 250, 500, 1000] as const;
export const TRANSFER_PRESETS = [10, 25, 50, 100, 250, 500] as const;
export const TOP_UP_PRESETS = [1000, 5000, 10000, 25000] as const;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function payoutFor(stake: number): number {
  return round2(stake * PAYOUT_MULTIPLIER);
}

export function settleTrade(
  direction: Direction,
  entry: number,
  close: number,
  stake: number,
): { status: Exclude<TradeStatus, "active">; payout: number } {
  if (close === entry) return { status: "draw", payout: round2(stake) };
  const won = direction === "buy" ? close > entry : close < entry;
  return won ? { status: "won", payout: payoutFor(stake) } : { status: "lost", payout: 0 };
}

export function stepValue<T extends readonly number[]>(steps: T, current: number, dir: 1 | -1): number {
  if (dir === 1) return steps.find((s) => s > current) ?? (steps[steps.length - 1] as number);
  const lower = [...steps].reverse().find((s) => s < current);
  return lower ?? (steps[0] as number);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function validateStake(stake: number, balance: number): string | null {
  if (!Number.isFinite(stake) || stake < MIN_STAKE) return `Minimum stake is $${MIN_STAKE}`;
  if (stake > balance) return "Insufficient available balance";
  return null;
}

export function validateTransfer(amount: number, fromBalance: number, from: AccountId, to: AccountId): string | null {
  if (from === to) return "Choose two different accounts";
  if (!Number.isFinite(amount) || amount < MIN_TRANSFER) return `Minimum transfer amount is $${MIN_TRANSFER}`;
  if (amount > fromBalance) return "Insufficient available balance";
  return null;
}

export function validateTopUp(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount";
  if (amount > MAX_TOP_UP) return `Maximum is $${MAX_TOP_UP.toLocaleString()} at a time`;
  return null;
}

export function formatMoney(n: number, currency: AccountId | "$" = "$"): string {
  const v = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "$" ? `$${v}` : `${currency} ${v}`;
}

export const MIN_WITHDRAW = 1;

export function validateWithdraw(amount: number, balance: number): string | null {
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAW) return `Minimum withdrawal is $${MIN_WITHDRAW}`;
  if (amount > balance) return "Insufficient available balance";
  return null;
}

/** The robot stops once its session loss reaches the stop loss or its session profit reaches the take profit. */
export function robotStopReason(sessionPL: number, stopLoss: number, takeProfit: number): "stop_loss" | "take_profit" | null {
  if (stopLoss > 0 && sessionPL <= -stopLoss) return "stop_loss";
  if (takeProfit > 0 && sessionPL >= takeProfit) return "take_profit";
  return null;
}

/**
 * Replays a strategy over past closing prices and returns how often it guessed the next move right (0-100).
 * "trend" bets the next move repeats the last one; "reverse" bets it turns around. Flat moves are skipped.
 */
export function backtestWinRate(closes: number[], strategy: "trend" | "reverse"): number {
  let wins = 0;
  let total = 0;
  for (let i = 2; i < closes.length; i++) {
    const last = (closes[i - 1] as number) - (closes[i - 2] as number);
    const next = (closes[i] as number) - (closes[i - 1] as number);
    if (last === 0 || next === 0) continue;
    const guessUp = strategy === "trend" ? last > 0 : last < 0;
    total++;
    if (guessUp === next > 0) wins++;
  }
  return total ? Math.round((wins / total) * 100) : 0;
}
