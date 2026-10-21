import type { Candle } from "./backtest";

export function chartWindow(candles: Candle[], now: number, duration: number) {
  const start = now - duration;
  const visible = candles.filter((c) => c[0] * 1000 >= start && c[0] * 1000 <= now);
  const previous = candles.filter((c) => c[0] * 1000 < start).at(-1);
  const baseline = previous?.[4] ?? visible[0]?.[1] ?? null;
  const covered =
    previous != null || (visible[0] != null && visible[0][0] * 1000 <= start + 300_000);
  return { visible, baseline, covered };
}
