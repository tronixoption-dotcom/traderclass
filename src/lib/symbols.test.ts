import { describe, expect, it } from "vitest";
import { SYMBOLS, SYMBOL_CATEGORIES, getSymbol } from "./symbols";
import { getQuote, hasFreshMarketQuote, setMarketQuote } from "./feed";

describe("live instrument catalog", () => {
  it("offers a large list with unique symbols across every market category", () => {
    expect(SYMBOLS.length).toBe(150);
    expect(new Set(SYMBOLS.map((s) => s.id)).size).toBe(SYMBOLS.length);
    for (const category of SYMBOL_CATEGORIES) {
      expect(SYMBOLS.some((s) => s.category === category)).toBe(true);
    }
    for (const id of ["XAUUSD", "EURUSD", "GBPJPY", "XAGUSD", "WTI", "COCOA", "US30", "AAPL", "ETHUSD"]) {
      expect(getSymbol(id).id).toBe(id);
    }
  });

  it("shows only fresh in-house quotes for in-house markets", () => {
    const symbol = "BTCUSD";
    expect(hasFreshMarketQuote(symbol)).toBe(false);
    expect(Number.isNaN(getQuote(symbol).mid)).toBe(true);
    const now = Date.now();
    setMarketQuote(symbol, 50000, 49999, 50001, now);
    expect(hasFreshMarketQuote(symbol)).toBe(true);
    expect(getQuote(symbol)).toMatchObject({ mid: 50000, bid: 49999, ask: 50001 });
    expect(Number.isInteger(getSymbol(symbol).decimals)).toBe(true);
  });
});
