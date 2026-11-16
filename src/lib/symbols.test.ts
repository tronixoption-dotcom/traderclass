import { describe, expect, it } from "vitest";
import { SYMBOLS, SYMBOL_CATEGORIES, getSymbol } from "./symbols";
import { buildHistory, getQuote } from "./feed";

describe("expanded practice instrument catalog", () => {
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

  it("provides usable simulated quotes and chart history for every instrument", () => {
    for (const symbol of SYMBOLS) {
      const quote = getQuote(symbol.id);
      expect(quote.mid).toBe(symbol.base);
      expect(quote.bid).toBeGreaterThan(0);
      expect(quote.ask).toBeGreaterThan(quote.bid);
      expect(Number.isFinite(quote.changePct)).toBe(true);
      expect(Number.isInteger(symbol.decimals)).toBe(true);
      const candles = buildHistory(symbol.id, 60, 10);
      expect(candles).toHaveLength(10);
      for (const candle of candles) {
        expect(candle.low).toBeGreaterThan(0);
        expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
        expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      }
    }
  });
});