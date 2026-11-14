import type { ChartRule } from "./chartRule";
import type { StrategyConfig } from "./strategy";

/** Scale PRICE levels only. Allocated capital, gas, shares, IDs and progress never change. */
export function scaleChartPrices(rule: ChartRule, factor: number): ChartRule {
  if (!(factor > 0) || !Number.isFinite(factor))
    throw new Error("Conversão dos pontos indisponível");
  return {
    ...rule,
    entryBnb: rule.entryBnb * factor,
    exitBnb: rule.exitBnb * factor,
    stopBnb: rule.stopBnb == null ? null : rule.stopBnb * factor,
    ...(rule.entries
      ? { entries: rule.entries.map((e) => ({ ...e, priceBnb: e.priceBnb * factor })) }
      : {}),
    ...(rule.exits
      ? { exits: rule.exits.map((e) => ({ ...e, priceBnb: e.priceBnb * factor })) }
      : {}),
  };
}

/** A USD anchor is a saved conversion reference, never the current BNB/USD exchange rate. */
export function chartUsdPrices(rule: ChartRule, liveBnbUsd: number | null): ChartRule | null {
  const rate = rule.priceAnchor?.bnbUsd ?? liveBnbUsd;
  return rate != null && Number.isFinite(rate) && rate > 0 ? scaleChartPrices(rule, rate) : null;
}

/** Current BNB equivalents for cost/fee guards, not new price targets or a saved config update. */
export function chartExecutionConfig(cfg: StrategyConfig, liveBnbUsd: number): StrategyConfig {
  const rule = cfg.chartRule;
  if (!rule?.priceAnchor) return cfg;
  const resolved = scaleChartPrices(rule, rule.priceAnchor.bnbUsd / liveBnbUsd);
  const { priceAnchor: _anchor, ...nativeRule } = resolved;
  return { ...cfg, chartRule: nativeRule };
}
