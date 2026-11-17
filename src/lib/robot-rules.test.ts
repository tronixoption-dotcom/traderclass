import { describe, expect, it } from "vitest";
import { backtestWinRate, robotStopReason, validateWithdraw } from "./trading";

describe("live withdrawal validation", () => {
  it("minimum withdrawal is $1", () => {
    expect(validateWithdraw(0.5, 100)).not.toBeNull();
    expect(validateWithdraw(1, 100)).toBeNull();
  });
  it("cannot withdraw more than the balance", () => {
    expect(validateWithdraw(101, 100)).not.toBeNull();
    expect(validateWithdraw(100, 100)).toBeNull();
  });
});

describe("robot stop loss and take profit", () => {
  it("stops when the session loss reaches the $10 stop loss", () => {
    expect(robotStopReason(-10, 10, 200)).toBe("stop_loss");
    expect(robotStopReason(-9.99, 10, 200)).toBeNull();
  });
  it("stops when the session profit reaches the $200 take profit", () => {
    expect(robotStopReason(200, 10, 200)).toBe("take_profit");
    expect(robotStopReason(199.99, 10, 200)).toBeNull();
  });
});

describe("robot win rate from past prices", () => {
  it("trend wins every time on a steady rise, reverse never does", () => {
    const rising = [1, 2, 3, 4, 5, 6];
    expect(backtestWinRate(rising, "trend")).toBe(100);
    expect(backtestWinRate(rising, "reverse")).toBe(0);
  });
  it("alternating prices favour reverse", () => {
    const zigzag = [1, 2, 1, 2, 1, 2];
    expect(backtestWinRate(zigzag, "reverse")).toBe(100);
  });
});
