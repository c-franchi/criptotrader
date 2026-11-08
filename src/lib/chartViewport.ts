import type { Candle } from "./marketStats";

export type CandleView = { start: number; end: number };

/**
 * Prefer the rightmost actual OHLCV bar instead of an empty window ending
 * at wall-clock time when the public feed is behind.
 *
 * This is a DISPLAY-ONLY viewport: it does not generate bars, move trades,
 * alter quotes, or imply that an old candle is a current market price.
 */
export function latestCandleViewport(
  candles: readonly Candle[],
  now: number,
  hours: number,
  minutes: number,
): CandleView {
  const span = hours * 3_600_000;
  if (!Number.isFinite(now) || !Number.isFinite(span) || span <= 0) {
    return { start: now - span, end: now };
  }

  let lastOpen = 0;
  for (const candle of candles) {
    const time = candle[0] * 1000;
    if (
      Number.isSafeInteger(candle[0]) &&
      time > 0 &&
      time <= now + 5 * 60_000 &&
      Number.isFinite(candle[4]) &&
      candle[4] > 0 &&
      time > lastOpen
    ) {
      lastOpen = time;
    }
  }
  if (!lastOpen) return { start: now - span, end: now };

  // The chart can display 5, 15, 30 or 60-minute candles aggregated
  // from true 5m OHLCV. Keep the entire last visible bucket on screen.
  const intervalMs = Math.max(5, minutes) * 60_000;
  const lastBucketEnd = (Math.floor(lastOpen / intervalMs) + 1) * intervalMs;

  // Leave modest breathing room to the right. Do NOT keep sliding the
  // viewport into empty future time while the provider remains stale.
  const padding = Math.min(span * 0.08, Math.max(5 * 60_000, intervalMs * 0.5));
  const end = Math.min(now, lastBucketEnd + padding);
  return { start: end - span, end };
}
