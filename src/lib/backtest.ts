import type { StrategyConfig } from "./strategy";

/** [time(s), open, high, low, close] in chronological order. */
export type Candle = [number, number, number, number, number];

export type WindowStats = { changePct: number; high: number; low: number; open: number; close: number; maxRisePct: number; maxDropPct: number };

export function windowStats(c: Candle[]): WindowStats | null {
  if (c.length === 0) return null;
  const open = c[0]![1], close = c[c.length - 1]![4];
  const high = Math.max(...c.map((x) => x[2])), low = Math.min(...c.map((x) => x[3]));
  return { open, close, high, low, changePct: (close / open - 1) * 100, maxRisePct: (high / open - 1) * 100, maxDropPct: (low / open - 1) * 100 };
}

export type BacktestResult = { trades: number; finalValue: number; pnl: number; pnlPct: number; holdPnlPct: number };

const FEE = 0.0025; // PancakeSwap V2 fee per swap

/** Simplified replay of a strategy over candles. Capital and sizes in the quote currency. */
export function backtest(c: Candle[], cfg: StrategyConfig, capital: number): BacktestResult | null {
  if (c.length < 2 || capital <= 0) return null;
  let quote = capital, tokens = 0, cost = 0, entries = 0, trades = 0, peak = c[0]![2], tpDone = 0, trailHigh = 0;
  const size = cfg.sizingMode === "fixo" ? cfg.buyAmount : (capital * cfg.buyAmount) / 100;
  const closes: number[] = [];
  const ma = (n: number) => (closes.length < n ? null : closes.slice(-n).reduce((a, b) => a + b, 0) / n);
  let prevFastAbove: boolean | null = null;
  const sell = (fraction: number, price: number) => {
    const amt = tokens * fraction;
    quote += amt * price * (1 - FEE) * (1 - (cfg.sellTaxPct ?? 0) / 100);
    cost *= 1 - fraction; tokens -= amt; trades++;
    if (tokens <= 1e-18) { tokens = 0; cost = 0; entries = 0; tpDone = 0; trailHigh = 0; }
  };
  for (const [, , h, l, cl] of c) {
    closes.push(cl);
    // exits first
    if (tokens > 0) {
      const avg = cost / tokens;
      trailHigh = Math.max(trailHigh, h);
      if (cfg.stopLossPct > 0 && l <= avg * (1 - cfg.stopLossPct / 100)) sell(1, avg * (1 - cfg.stopLossPct / 100));
      else if (cfg.trailingEnabled && trailHigh >= avg * (1 + cfg.trailingActivatePct / 100) && l <= trailHigh * (1 - cfg.trailingDistancePct / 100)) sell(1, trailHigh * (1 - cfg.trailingDistancePct / 100));
      else {
        while (tokens > 0 && tpDone < cfg.takeProfits.length) {
          const tp = cfg.takeProfits[tpDone]!;
          const target = avg * (1 + tp.pct / 100);
          if (h < target) break;
          tpDone++;
          sell(Math.min(1, tp.sellPct / 100), target);
        }
      }
    }
    // entries
    const spent = tokens > 0 ? cost : 0;
    const canBuy = entries < Math.max(1, cfg.maxEntries) && quote >= size && size > 0 && (cfg.maxExposureQuote <= 0 || spent + size <= cfg.maxExposureQuote + 1e-12);
    let price: number | null = null;
    if (cfg.entryType === "queda") {
      const ref = cfg.referenceType === "manual" && cfg.manualReference ? cfg.manualReference : peak;
      void prevFastAbove;
      const trigger = ref * (1 - cfg.dropPct / 100);
      if (cfg.dropPct > 0 && l <= trigger) price = trigger;
    } else {
      const f = ma(cfg.maFast), s = ma(cfg.maSlow);
      if (f !== null && s !== null) {
        // buy the dip inside an uptrend (same rule as the robot)
        if (f > s && l <= s) price = Math.min(s, cl);
        prevFastAbove = f > s;
      }
    }
    if (canBuy && price !== null) {
      quote -= size; tokens += (size * (1 - FEE) * (1 - (cfg.buyTaxPct ?? 0) / 100)) / price; cost += size; entries++; trades++;
      peak = price; // signal re-arms from the new level
    }
    peak = Math.max(peak, h);
  }
  const last = c[c.length - 1]![4];
  const finalValue = quote + tokens * last;
  return { trades, finalValue, pnl: finalValue - capital, pnlPct: (finalValue / capital - 1) * 100, holdPnlPct: (last / c[0]![1] - 1) * 100 };
}
