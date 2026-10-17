import type { Candle } from "./backtest";

export type Bar = { candle: Candle; complete: boolean; forming: boolean };
export function normalizedCandles(input: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of input) if (c.length >= 5 && c.slice(0, 5).every(Number.isFinite) && c.slice(1, 5).every(n => n != null && n > 0)) map.set(c[0], c);
  return [...map.values()].sort((a, b) => a[0] - b[0]);
}

/** Pool OHLCV, not price samples. Missing 5m slots never become synthetic candles. */
export function aggregateCandles(input: Candle[], minutes: number, now: number): Bar[] {
  const size = minutes * 60;
  const groups = new Map<number, Candle[]>();
  for (const c of normalizedCandles(input)) {
    if (c[0] * 1000 > now) continue;
    const start = Math.floor(c[0] / size) * size;
    groups.set(start, [...(groups.get(start) ?? []), c]);
  }
  return [...groups].map(([start, cs]) => {
    const first = cs[0], last = cs.at(-1);
    if (!first || !last) throw new Error("Grupo vazio");
    const complete = cs.length === minutes / 5 && cs.every((c, i) => c[0] === start + i * 300);
    const volume = cs.every(c => c[5] != null && Number.isFinite(c[5])) ? cs.reduce((sum, c) => sum + (c[5] ?? 0), 0) : undefined;
    return { candle: [start, first[1], Math.max(...cs.map(c => c[2])), Math.min(...cs.map(c => c[3])), last[4], volume] as Candle, complete, forming: (start + size) * 1000 > now };
  });
}

/** Only the contiguous tail of complete, closed candles is eligible for candidate decisions. */
export function closedTail(input: Candle[], minutes: number, now: number): Candle[] {
  const bars = aggregateCandles(input, minutes, now).filter(b => !b.forming);
  const out: Candle[] = [];
  for (const b of bars) {
    if (!b.complete || (out.length && b.candle[0] !== (out.at(-1)?.[0] ?? 0) + minutes * 60)) out.length = 0;
    if (b.complete) out.push(b.candle);
  }
  return out;
}
export function sma(values: number[], length: number): number | null {
  if (!Number.isInteger(length) || length < 1 || values.length < length) return null;
  return values.slice(-length).reduce((a, b) => a + b, 0) / length;
}

/** Legacy engine bucket rule, explicit so chart and the unchanged live engine agree. */
export function engineSeries(input: Candle[], minutes: number, now: number) {
  const map = new Map<number, number>();
  for (const c of input) {
    const bucket = Math.floor(c[0] / (minutes * 60));
    if (bucket < Math.floor(now / 1000 / (minutes * 60))) map.set(bucket, c[4]);
  }
  const entries = [...map].sort((a, b) => a[0] - b[0]);
  return entries.map(([bucket, close], i) => ({ time: (bucket + 1) * minutes * 60 * 1000, close, fast: sma(entries.slice(0, i + 1).map(e => e[1]), 9), slow: sma(entries.slice(0, i + 1).map(e => e[1]), 21) }));
}