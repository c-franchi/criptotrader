import { expect, it } from "vitest";
import { mergeCandles, candleRanges, missingHistory } from "./historyPaging";
import type { Candle } from "./marketStats";
const c = (time: number, price = 1): Candle => [time, price, price, price, price];
it("retains older candles across live refreshes and lets newer evidence replace duplicates", () => {
  expect(mergeCandles([c(0), c(300)], [c(300, 2), c(600)])).toEqual([c(0), c(300, 2), c(600)]);
});
it("does not mistake a jump to an old purchase for complete intervening history", () => {
  const ranges = candleRanges([c(0), c(300), c(3600)]);
  expect(ranges).toEqual([
    { start: 0, end: 600000 },
    { start: 3600000, end: 3900000 },
  ]);
  expect(missingHistory(0, 3900000, ranges)).toEqual({ start: 600000, end: 3600000 });
  expect(missingHistory(100000, 500000, ranges)).toBeNull();
});
