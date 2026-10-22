import type { Candle } from "./backtest";
import type { StrategyConfig } from "./strategy";
import { closesAt, intervalMinutes, referenceHigh } from "./autoStrategy";
import { closedTail } from "./candleSeries";
export function strategyObservation(
  cfg: StrategyConfig,
  candles: Candle[],
  priceUsd: number,
  liquidityUsd: number | null,
  now: number,
) {
  const minutes = intervalMinutes(cfg.candleInterval);
  const complete = closedTail(candles, minutes, now);
  const last = complete.at(-1);
  const fresh = !!last && now - (last[0] + minutes * 60) * 1000 < minutes * 60_000 * 2;
  const strict = cfg.rulesVersion === 2 || cfg.recovery?.enabled;
  return {
    priceUsd,
    liquidityUsd,
    now,
    high: referenceHigh(candles, now / 1000 - cfg.windowHours * 3600),
    closes: strict ? complete.map((c) => c[4]) : closesAt(candles, minutes, now),
    closedTimes: strict ? complete.map((c) => c[0]) : [],
    historyFresh: fresh,
    completeCount: complete.length,
  };
}
