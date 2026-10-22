import { closedTail } from "./candleSeries";
import type { Candle } from "./marketStats";

/** Display-only indicators, using complete closed candles after the last gap. */
export function chartIndicators(candles: Candle[], minutes: number, now: number) {
  const tail = closedTail(candles, minutes, now);
  const closes = tail.map((c) => c[4]);
  const emaPeriod = 20;
  let ema: number | null = null;
  if (closes.length >= emaPeriod) {
    ema = closes.slice(0, emaPeriod).reduce((a, b) => a + b, 0) / emaPeriod;
    for (const close of closes.slice(emaPeriod)) ema += (close - ema) * (2 / (emaPeriod + 1));
  }
  let rsi: number | null = null;
  let atr: number | null = null;
  if (tail.length >= 15) {
    const gains: number[] = [],
      losses: number[] = [],
      ranges: number[] = [];
    for (let i = 1; i < tail.length; i++) {
      const c = tail[i]!,
        prev = tail[i - 1]!;
      const delta = c[4] - prev[4];
      gains.push(Math.max(0, delta));
      losses.push(Math.max(0, -delta));
      ranges.push(Math.max(c[2] - c[3], Math.abs(c[2] - prev[4]), Math.abs(c[3] - prev[4])));
    }
    const wilder = (values: number[]) => {
      let avg = values.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
      for (const value of values.slice(14)) avg = (avg * 13 + value) / 14;
      return avg;
    };
    const gain = wilder(gains),
      loss = wilder(losses);
    rsi = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    atr = wilder(ranges);
  }
  const last = tail.at(-1);
  return { ema, rsi, atr, count: tail.length, time: last ? last[0] * 1000 : null };
}
