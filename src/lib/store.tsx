import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPrice, getQuote, hasFreshExchangeQuote, startFeed, subscribeFeed } from "./feed";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  STARTING_BALANCE,
  robotStopReason,
  round2,
  settleTrade,
  validateStake,
  validateTopUp,
  validateTransfer,
  validateWithdraw,
  type AccountId,
  type Direction,
  type TradeStatus,
} from "./trading";
import { getSymbol } from "./symbols";
import { DEFAULT_SETTINGS, actionAllowed, type SiteSettings } from "./admin-rules";
import { placeRealTrade, settleDueRealTrades } from "./real-trading.functions";
import { isOkxSymbol } from "./okx-market";

export type Trade = {
  id: string;
  symbol: string;
  direction: Direction;
  stake: number;
  entry: number;
  close?: number;
  payout?: number;
  account: AccountId;
  openedAt: number;
  expiresAt: number;
  duration: number;
  status: TradeStatus;
  byRobot?: boolean;
  real?: boolean;
};

export type Transaction = {
  id: string;
  kind: "topup" | "withdrawal" | "transfer";
  amount: number;
  account: AccountId;
  to?: AccountId;
  at: number;
};

export type RobotConfig = {
  running: boolean;
  symbol: string;
  stake: number;
  duration: number;
  strategy: "trend" | "reverse" | "random";
  stopLoss: number;
  takeProfit: number;
  /** When the current (or last) robot session started. */
  startedAt?: number;
};

export type Profile = { username: string; referral_code: string };
export type AuthUser = { id: string; email: string | null };

export type AppState = {
  userId: string;
  name: string;
  balances: Record<AccountId, number>;
  active: AccountId;
  accountMode: "demo" | "real";
  trades: Trade[];
  transactions: Transaction[];
  theme: "light" | "dark";
  robot: RobotConfig;
};

const KEY = "goldmarket-practice-v1";

const uid = (n = 10) =>
  Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 56)]).join("");

export function freshState(): AppState {
  return {
    userId: "GM" + uid(8),
    name: "Demo Trader",
    balances: { USD: STARTING_BALANCE, USDT: STARTING_BALANCE },
    active: "USDT",
    accountMode: "demo",
    trades: [],
    transactions: [],
    theme: "light",
    robot: { running: false, symbol: "XAUUSD", stake: 5, duration: 5, strategy: "trend", stopLoss: 10, takeProfit: 200 },
  };
}

type Ctx = {
  state: AppState;
  siteSettings: SiteSettings;
  hydrated: boolean;
  placeTrade: (t: { symbol: string; direction: Direction; stake: number; duration: number; byRobot?: boolean }) => string | null;
  topUp: (account: AccountId, amount: number) => string | null;
  withdraw: (account: AccountId, amount: number) => string | null;
  user: AuthUser | null;
  authReady: boolean;
  profile: Profile | null;
  /** True once the signed-in user's saved account has been loaded. */
  synced: boolean;
  signOut: () => Promise<void>;
  transfer: (from: AccountId, to: AccountId, amount: number) => string | null;
  setActive: (a: AccountId) => void;
  setAccountMode: (mode: "demo" | "real") => void;
  realBalance: number;
  realTrades: Trade[];
  realSettings: { enabled: boolean; minStake: number; maxStake: number };
  submitRealTrade: (trade: { symbol: string; direction: Direction; stake: number; duration: number; byRobot?: boolean }) => Promise<string | null>;
  setTheme: (t: "light" | "dark") => void;
  setName: (n: string) => void;
  setRobot: (r: Partial<RobotConfig>) => void;
  reset: () => void;
};

const StoreCtx = createContext<Ctx | null>(null);

function mergeSaved(saved: Partial<AppState>): AppState {
  const base = freshState();
  return { ...base, ...saved, robot: { ...base.robot, ...(saved.robot ?? {}), running: false } };
}

/** Robot trades in the current session and their combined profit or loss. */
export function robotSession(s: AppState, realTrades: Trade[] = []) {
  const since = s.robot.startedAt ?? Infinity;
  const source = s.accountMode === 'real' ? realTrades : s.trades;
  const trades = source.filter((t) => t.byRobot && t.openedAt >= since);
  const done = trades.filter((t) => t.status !== "active");
  const profits = round2(done.filter((t) => t.status === "won").reduce((a, t) => a + (t.payout ?? 0) - t.stake, 0));
  const losses = done.filter((t) => t.status === "lost").length;
  const pl = round2(done.reduce((a, t) => a + (t.payout ?? 0) - t.stake, 0));
  return { trades: trades.length, profits, losses, pl };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const openReal = useServerFn(placeRealTrade);
  const settleReal = useServerFn(settleDueRealTrades);
  const [state, setState] = useState<AppState>(freshState);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [synced, setSynced] = useState(false);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [realBalance, setRealBalance] = useState(0);
  const [realTrades, setRealTrades] = useState<Trade[]>([]);
  const [realSettings, setRealSettings] = useState({ enabled: false, minStake: 1, maxStake: 100 });
  const realTradesRef = useRef(realTrades);
  realTradesRef.current = realTrades;
  const realSettingsRef = useRef(realSettings);
  realSettingsRef.current = realSettings;
  const robotSubmitPending = useRef(false);
  const settingsRef = useRef(siteSettings);
  settingsRef.current = siteSettings;
  const ref = useRef(state);
  ref.current = state;
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(mergeSaved(JSON.parse(raw)));
    } catch {
      /* ignore bad saved data */
    }
    setHydrated(true);
    startFeed();
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  const commit = useCallback((next: AppState) => {
    ref.current = next;
    setState(next);
  }, []);

  const submitRealTrade = useCallback(async (trade: { symbol: string; direction: Direction; stake: number; duration: number; byRobot?: boolean }) => {
    if (!user) return 'Sign in to use a live account';
    try {
      const result = await openReal({ data: { ...trade, requestId: crypto.randomUUID() } });
      setRealBalance(result.balance);
      const row = result.trade;
      const mapped: Trade = { id: row.id, symbol: row.symbol, direction: row.direction as Direction, stake: Number(row.stake), entry: Number(row.entry_price), account: 'USDT', openedAt: Date.parse(row.created_at), expiresAt: Date.parse(row.expires_at), duration: row.duration_seconds, status: 'active', real: true, byRobot: row.by_robot };
      setRealTrades((current) => [mapped, ...current.filter((item) => item.id !== mapped.id)].slice(0, 100));
      return null;
    } catch (error) { return error instanceof Error ? error.message : 'Could not open live trade'; }
  }, [openReal, user]);
  const submitRealTradeRef = useRef(submitRealTrade);
  submitRealTradeRef.current = submitRealTrade;

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.from('site_settings').select('trading_enabled,robot_enabled,deposits_enabled,withdrawals_enabled,real_trading_enabled,real_min_stake,real_max_stake,deposit_fee_percent,withdrawal_fee_percent,announcement').maybeSingle();
      if (active && !error) {
        const next = data ?? DEFAULT_SETTINGS;
        settingsRef.current = next;
        setSiteSettings(next);
        if (!actionAllowed(next, 'robot') && ref.current.robot.running) commit({ ...ref.current, robot: { ...ref.current.robot, running: false } });
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [commit]);

  useEffect(() => {
    if (!user || !synced) { setRealBalance(0); setRealTrades([]); return; }
    let active = true;
    const refresh = async () => {
      try {
        const result = await settleReal();
        if (!active) return;
        setRealBalance(result.balance);
        if ('settings' in result) {
          setRealSettings(result.settings);
          if (!result.settings.enabled && ref.current.accountMode === 'real' && ref.current.robot.running) commit({ ...ref.current, robot: { ...ref.current.robot, running: false } });
        }
        setRealTrades(result.trades.map((row) => ({ id: row.id, symbol: row.symbol, direction: row.direction as Direction, stake: Number(row.stake), entry: Number(row.entry_price), close: row.close_price === null ? undefined : Number(row.close_price), payout: Number(row.payout), account: 'USDT' as const, openedAt: Date.parse(row.created_at), expiresAt: Date.parse(row.expires_at), duration: row.duration_seconds, status: row.status === 'open' ? 'active' : row.status as TradeStatus, real: true, byRobot: row.by_robot })));
      } catch (error) { if (active) console.error('Refreshing real trading wallet failed', error); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [user?.id, synced, settleReal]);

  const placeTrade: Ctx["placeTrade"] = useCallback(
    ({ symbol, direction, stake, duration, byRobot }) => {
      if (!actionAllowed(settingsRef.current, byRobot ? 'robot' : 'trade')) return 'Demo trading is currently paused by the administrator';
      const s = ref.current;
      const err = validateStake(stake, s.balances[s.active]);
      if (err) return err;
      const now = Date.now();
      const trade: Trade = {
        id: uid(12),
        symbol,
        direction,
        stake,
        entry: getPrice(symbol),
        account: s.active,
        openedAt: now,
        expiresAt: now + duration * 1000,
        duration,
        status: "active",
        ...(byRobot ? { byRobot: true } : {}),
      };
      commit({
        ...s,
        balances: { ...s.balances, [s.active]: round2(s.balances[s.active] - stake) },
        trades: [trade, ...s.trades].slice(0, 300),
      });
      return null;
    },
    [commit],
  );

  // Settle expired trades and run the robot.
  useEffect(() => {
    if (!hydrated) return;
    return subscribeFeed(() => {
      const s = ref.current;
      const now = Date.now();
      const due = s.trades.filter((t) => t.status === "active" && t.expiresAt <= now);
      if (due.length) {
        const balances = { ...s.balances };
        const trades = s.trades.map((t) => {
          if (t.status !== "active" || t.expiresAt > now) return t;
          const close = getPrice(t.symbol);
          const r = settleTrade(t.direction, t.entry, close, t.stake);
          balances[t.account] = round2(balances[t.account] + r.payout);
          const sym = getSymbol(t.symbol);
          if (r.status === "won") toast.success(`${sym.id} ${t.direction.toUpperCase()} won +$${(r.payout - t.stake).toFixed(2)}`);
          else if (r.status === "lost") toast.error(`${sym.id} ${t.direction.toUpperCase()} lost -$${t.stake.toFixed(2)}`);
          else toast(`${sym.id} draw, stake returned`);
          return { ...t, status: r.status, payout: r.payout, close };
        });
        commit({ ...ref.current, balances, trades });
      }
      const cur = ref.current;
      if (cur.robot.running) {
        const reason = robotStopReason(robotSession(cur, realTradesRef.current).pl, cur.robot.stopLoss, cur.robot.takeProfit);
        if (reason) {
          commit({ ...cur, robot: { ...cur.robot, running: false } });
          toast(reason === "stop_loss" ? "Robot stopped: stop loss reached" : "Robot stopped: take profit reached");
          return;
        }
      }
      const robotTrades = cur.accountMode === 'real' ? realTradesRef.current : cur.trades;
      if (cur.robot.running && !robotTrades.some((t) => t.byRobot && t.status === "active")) {
        const r = cur.robot;
        const last = robotTrades.find((t) => t.byRobot && t.symbol === r.symbol && t.close !== undefined);
        let dir: Direction;
        if (r.strategy === 'random') dir = Math.random() > 0.5 ? 'buy' : 'sell';
        else {
          const observedMomentum = getQuote(r.symbol).change;
          const momentum = observedMomentum !== 0 ? observedMomentum : last ? (last.close ?? last.entry) - last.entry : 0;
          if (momentum === 0) return;
          const up = momentum > 0;
          dir = r.strategy === 'trend' ? (up ? 'buy' : 'sell') : (up ? 'sell' : 'buy');
        }
        if (cur.accountMode === 'real') {
          if (robotSubmitPending.current || !realSettingsRef.current.enabled || !isOkxSymbol(r.symbol) || !hasFreshExchangeQuote(r.symbol)) return;
          robotSubmitPending.current = true;
          void (async () => {
            try {
              const err = await submitRealTradeRef.current({ symbol: r.symbol, direction: dir, stake: r.stake, duration: r.duration, byRobot: true });
              if (err) {
                commit({ ...ref.current, robot: { ...ref.current.robot, running: false } });
                toast.error(`Robot stopped: ${err}`);
              }
            } finally { robotSubmitPending.current = false; }
          })();
        } else {
          const err = placeTrade({ symbol: r.symbol, direction: dir, stake: r.stake, duration: r.duration, byRobot: true });
          if (err) {
            commit({ ...ref.current, robot: { ...ref.current.robot, running: false } });
            toast.error(`Robot stopped: ${err}`);
          }
        }
      }
    });
  }, [hydrated, commit, placeTrade]);

  // Follow the signed-in user and load their saved practice account.
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const load = async (u: { id: string; email?: string | null | undefined } | null) => {
      if (!active) return;
      if (!u) {
        setUser(null);
        setProfile(null);
        setSynced(false);
        setAuthReady(true);
        return;
      }
      setAuthReady(false);
      setUser({ id: u.id, email: u.email ?? null });
      const [{ data: prof }, { data: row }] = await Promise.all([
        supabase.from("profiles").select("username, referral_code").eq("id", u.id).maybeSingle(),
        supabase.from("practice_accounts").select("state").eq("user_id", u.id).maybeSingle(),
      ]);
      if (!active) return;
      if (prof) setProfile(prof);
      if (row?.state && typeof row.state === "object") {
        commit(mergeSaved(row.state as Partial<AppState>));
      } else {
        const start = { ...ref.current, name: prof?.username ?? ref.current.name };
        commit(start);
        await supabase.from("practice_accounts").insert({ user_id: u.id, state: start as unknown as Json });
      }
      if (active) {
        setSynced(true);
        setAuthReady(true);
      }
    };
    supabase.auth.getUser().then(({ data }) => load(data.user)).catch(() => {
      if (active) {
        setUser(null);
        setProfile(null);
        setSynced(false);
        setAuthReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setSynced(false);
        setAuthReady(true);
        localStorage.removeItem(KEY);
        commit({ ...freshState(), theme: ref.current.theme });
        return;
      }
      if (event === "SIGNED_IN" && session?.user && session.user.id !== userIdRef.current) {
        setAuthReady(false);
        setTimeout(() => load(session.user), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrated, commit]);

  // Save the signed-in user's practice account a moment after each change.
  useEffect(() => {
    if (!user || !synced) return;
    const t = setTimeout(() => {
      supabase
        .from("practice_accounts")
        .update({ state: state as unknown as Json, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) console.error("Saving practice account failed", error);
        });
    }, 1200);
    return () => clearTimeout(t);
  }, [state, user, synced]);

  const value = useMemo<Ctx>(
    () => ({
      state,
      siteSettings,
      hydrated,
      placeTrade,
      topUp: (account, amount) => {
        if (!actionAllowed(settingsRef.current, 'deposit')) return 'Deposits are currently paused';
        const err = validateTopUp(amount);
        if (err) return err;
        const s = ref.current;
        commit({
          ...s,
          balances: { ...s.balances, [account]: round2(s.balances[account] + amount) },
          transactions: [{ id: uid(12), kind: "topup" as const, amount, account, at: Date.now() }, ...s.transactions],
        });
        return null;
      },
      withdraw: (account, amount) => {
        if (!actionAllowed(settingsRef.current, 'withdrawal')) return 'Withdrawals are currently paused';
        const s = ref.current;
        const err = validateWithdraw(amount, s.balances[account]);
        if (err) return err;
        commit({
          ...s,
          balances: { ...s.balances, [account]: round2(s.balances[account] - amount) },
          transactions: [{ id: uid(12), kind: "withdrawal" as const, amount, account, at: Date.now() }, ...s.transactions],
        });
        return null;
      },
      user,
      authReady,
      profile,
      synced,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      transfer: (from, to, amount) => {
        const s = ref.current;
        const err = validateTransfer(amount, s.balances[from], from, to);
        if (err) return err;
        commit({
          ...s,
          balances: { ...s.balances, [from]: round2(s.balances[from] - amount), [to]: round2(s.balances[to] + amount) },
          transactions: [{ id: uid(12), kind: "transfer" as const, amount, account: from, to, at: Date.now() }, ...s.transactions],
        });
        return null;
      },
      setActive: (a) => commit({ ...ref.current, active: a }),
      setAccountMode: (mode) => commit({ ...ref.current, accountMode: mode, robot: { ...ref.current.robot, running: false } }),
      realBalance,
      realTrades,
      realSettings,
      submitRealTrade,
      setTheme: (t) => commit({ ...ref.current, theme: t }),
      setName: (n) => {
        commit({ ...ref.current, name: n });
        if (user) {
          setProfile((p) => (p ? { ...p, username: n } : p));
          // Query builders only send when awaited or then'd.
          supabase
            .from("profiles")
            .update({ username: n })
            .eq("id", user.id)
            .then(({ error }) => error && toast.error("Couldn't save your username"));
        }
      },
      setRobot: (r) => {
        if (r.running && ref.current.accountMode === 'real') {
          const config = { ...ref.current.robot, ...r };
          if (!user) { toast.error('Sign in before starting the live account robot'); return; }
          if (!realSettingsRef.current.enabled || !actionAllowed(settingsRef.current, 'trade') || !actionAllowed(settingsRef.current, 'robot')) { toast.error('Live account robot trading is currently unavailable'); return; }
          if (!isOkxSymbol(config.symbol)) { toast.error('Choose a crypto market supported by OKX for live robot trading'); return; }
          if (!hasFreshExchangeQuote(config.symbol)) { toast.error('Wait for a fresh OKX market price before starting'); return; }
          if (config.stake < realSettingsRef.current.minStake || config.stake > realSettingsRef.current.maxStake || config.stake > realBalance) { toast.error('Check your live USDT balance and the configured stake limits'); return; }
        }
        if (r.running && !actionAllowed(settingsRef.current, 'robot')) { toast.error('Robot trading is currently paused'); return; }
        const cur = ref.current.robot;
        const startedAt = r.running && !cur.running ? Date.now() : cur.startedAt;
        commit({ ...ref.current, robot: { ...cur, ...r, ...(startedAt ? { startedAt } : {}) } });
      },
      reset: () => commit({ ...freshState(), theme: ref.current.theme }),
    }),
    [state, siteSettings, hydrated, placeTrade, commit, user, authReady, profile, synced, realBalance, realTrades, realSettings, submitRealTrade],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore must be used inside StoreProvider");
  return c;
}

/** Re-renders every feed tick. */
export function useTick() {
  const [, set] = useState(0);
  useEffect(() => subscribeFeed(() => set((n) => n + 1)), []);
}
