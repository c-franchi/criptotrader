import { it, expect } from "vitest";
import { technicalSeries } from "./technicalSeries";
import { formatPrice } from "./display";
import type { Candle } from "./marketStats";
it("preserves small prices and formats large prices for Brazil", () => {
  expect(formatPrice(83849.039975)).toBe("83.849,04");
  expect(formatPrice(0.000000012345678)).toBe("0,0000000123457");
  expect(formatPrice(NaN)).toBe("—");
});
it("computes population Bollinger bands and resets indicators at gaps", () => {
  const bars: Candle[] = Array.from({ length: 25 }, (_, i) => [i * 300, 100, 101, 99, 100, 10]);
  const series = technicalSeries(bars, 5, 7500000);
  expect(series[19]?.upper).toBe(100);
  expect(series[19]?.lower).toBe(100);
  expect(series[19]?.rsi).toBe(50);
  const missing = technicalSeries(
    bars.filter((_, i) => i !== 20),
    5,
    7500000,
  );
  expect(missing.at(-1)?.ema).toBeNull();
  expect(missing.at(-1)?.upper).toBeNull();
});
