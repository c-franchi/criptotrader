import type { Candle } from "./marketStats";
export type TimeRange = { start: number; end: number };
/** Later lists win at duplicate timestamps, so live refreshes retain the current candle. */
export function mergeCandles(...lists: Candle[][]): Candle[] {
  const map = new Map<number, Candle>();
  for (const list of lists) for (const candle of list) map.set(candle[0], candle);
  return [...map.values()].sort((a, b) => a[0] - b[0]);
}
/** Candle coverage is discontinuous: loading an old purchase must not hide the gap to today. */
export function candleRanges(candles: Candle[]): TimeRange[] {
  const ranges: TimeRange[] = [];
  for (const c of candles) {
    const start = c[0] * 1000,
      end = start + 300000;
    const last = ranges.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else ranges.push({ start, end });
  }
  return ranges;
}
/** Most recent uncovered segment, suitable for backward cursor pagination. */
export function missingHistory(start: number, end: number, ranges: TimeRange[]): TimeRange | null {
  let right = end;
  for (const range of [...ranges].sort((a, b) => b.end - a.end)) {
    if (range.start >= right || range.end <= start) continue;
    if (range.end < right) return { start: Math.max(start, range.end), end: right };
    right = Math.min(right, range.start);
    if (right <= start) return null;
  }
  return right > start ? { start, end: right } : null;
}
