/** [time(s), open, high, low, close] in chronological order. */
export type Candle = [number, number, number, number, number, (number | undefined)?];

export type WindowStats = {
  changePct: number;
  high: number;
  low: number;
  open: number;
  close: number;
  maxRisePct: number;
  maxDropPct: number;
};

export function windowStats(c: Candle[]): WindowStats | null {
  if (c.length === 0) return null;
  const open = c[0]![1],
    close = c[c.length - 1]![4];
  const high = Math.max(...c.map((x) => x[2])),
    low = Math.min(...c.map((x) => x[3]));
  return {
    open,
    close,
    high,
    low,
    changePct: (close / open - 1) * 100,
    maxRisePct: (high / open - 1) * 100,
    maxDropPct: (low / open - 1) * 100,
  };
}
