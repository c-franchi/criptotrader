import type { StrategyConfig } from "./strategy";

type StopConfig = Pick<StrategyConfig, "stopLossPct" | "stopLossMode" | "buyTaxPct" | "sellTaxPct">;

/** Estimate from entry market price; includes token taxes, not gas, slippage or pool impact. */
export function netPositionPct(price: number, entry: number, cfg: StopConfig): number {
  return ((price / entry) * (1 - (cfg.buyTaxPct ?? 0) / 100) * (1 - (cfg.sellTaxPct ?? 0) / 100) - 1) * 100;
}

export function stopPrice(entry: number, cfg: StopConfig): number | null {
  if (!(entry > 0) || !(cfg.stopLossPct > 0) || cfg.stopLossPct >= 100) return null;
  const retained = cfg.stopLossMode === "liquido" ? (1 - (cfg.buyTaxPct ?? 0) / 100) * (1 - (cfg.sellTaxPct ?? 0) / 100) : 1;
  if (!(retained > 0)) return null;
  return entry * (1 - cfg.stopLossPct / 100) / retained;
}

/** Token has a buy or sell tax: ready-made strategies start with stop disabled. */
export function hasTokenTax(tax: { buy: number; sell: number }): boolean {
  return tax.buy > 0 || tax.sell > 0;
}

/** Loss (% of BNB spent) if the stop fires, including buy+sell taxes. Not gas/slippage. */
export function stopRealLossPct(cfg: StopConfig): number | null {
  const p = stopPrice(1, cfg);
  if (p == null) return null;
  return -netPositionPct(p, 1, cfg);
}
