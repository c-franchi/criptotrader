import { describe, it, expect } from "vitest";
import { chartIndicators } from "./chartIndicators";
import type { Candle } from "./backtest";
const candles = (n: number, close: (i: number) => number): Candle[] =>
  Array.from({ length: n }, (_, i) => [
    i * 300,
    close(i),
    close(i) + 1,
    close(i) - 1,
    close(i),
    10,
  ]);
describe("display indicators", () => {
  it("uses Wilder RSI/ATR and an SMA-seeded EMA", () => {
    const x = chartIndicators(
      candles(21, (i) => 100 + i),
      5,
      21 * 300000,
    );
    expect(x.rsi).toBe(100);
    expect(x.atr).toBe(2);
    expect(x.ema).toBeCloseTo(110.5);
  });
  it("handles flat prices without division by zero", () => {
    expect(
      chartIndicators(
        candles(20, () => 100),
        5,
        20 * 300000,
      ).rsi,
    ).toBe(50);
  });
  it("does not bridge gaps or include the current candle", () => {
    const c = candles(22, (i) => 100 + i).filter((_, i) => i !== 19);
    const x = chartIndicators(c, 5, 21 * 300000 + 1000);
    expect(x.count).toBe(1);
    expect(x.rsi).toBeNull();
    expect(x.ema).toBeNull();
  });
});
