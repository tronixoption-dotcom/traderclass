import { describe, expect, it } from "vitest";
import { payoutFor, settleTrade, stepValue, STAKE_STEPS, validateStake, validateTransfer } from "./trading";

describe("live trading display rules", () => {
  it("a $5 stake pays $8.50 when it wins", () => {
    expect(payoutFor(5)).toBe(8.5);
  });

  it("BUY wins when price closes higher, SELL wins when lower", () => {
    expect(settleTrade("buy", 100, 101, 5)).toEqual({ status: "won", payout: 8.5 });
    expect(settleTrade("buy", 100, 99, 5)).toEqual({ status: "lost", payout: 0 });
    expect(settleTrade("sell", 100, 99, 5)).toEqual({ status: "won", payout: 8.5 });
  });

  it("an unchanged price returns the stake", () => {
    expect(settleTrade("sell", 100, 100, 5)).toEqual({ status: "draw", payout: 5 });
  });

  it("minimum transfer is $1 and cannot exceed the balance", () => {
    expect(validateTransfer(0.5, 100, "USD", "USDT")).not.toBeNull();
    expect(validateTransfer(1, 100, "USD", "USDT")).toBeNull();
    expect(validateTransfer(150, 100, "USD", "USDT")).not.toBeNull();
  });

  it("stake cannot exceed the balance", () => {
    expect(validateStake(20, 10)).not.toBeNull();
    expect(validateStake(5, 10)).toBeNull();
  });

  it("stake stepper moves to the next step", () => {
    expect(stepValue(STAKE_STEPS, 5, 1)).toBe(10);
    expect(stepValue(STAKE_STEPS, 5, -1)).toBe(2);
  });
});
