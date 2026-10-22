import { aggregateCandles } from "./candleSeries";
import { chartIndicators } from "./chartIndicators";
import type { Candle } from "./marketStats";
/** Display only. Reset all windows at incomplete bars and missing intervals. */
export function technicalSeries(candles: Candle[], minutes: number, now: number) {
  const result: {
    time: number;
    ema: number | null;
    rsi: number | null;
    upper: number | null;
    lower: number | null;
  }[] = [];
  let tail: Candle[] = [];
  for (const bar of aggregateCandles(candles, minutes, now)) {
    if (bar.forming) continue;
    const c = bar.candle;
    if (!bar.complete || (tail.length && c[0] !== tail.at(-1)![0] + minutes * 60)) tail = [];
    if (!bar.complete) {
      result.push({ time: c[0] * 1000, ema: null, rsi: null, upper: null, lower: null });
      continue;
    }
    tail.push(c);
    const stats = chartIndicators(tail, minutes, (c[0] + minutes * 60) * 1000);
    const window = tail.slice(-20).map((c) => c[4]);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const std = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length);
    result.push({
      time: c[0] * 1000,
      ema: stats.ema,
      rsi: stats.rsi,
      upper: window.length === 20 ? mean + 2 * std : null,
      lower: window.length === 20 ? mean - 2 * std : null,
    });
  }
  return result;
}
