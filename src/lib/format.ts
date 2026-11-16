import { getSymbol } from "./symbols";

export function fmtPrice(symbol: string, price: number, extra = 0) {
  const d = getSymbol(symbol).decimals + extra;
  return price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
