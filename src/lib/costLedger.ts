export type CostAssumptions = {
  buyTaxPct: number;
  sellTaxPct: number;
  dexFeePct: number;
  impactPct: number;
  gasPerTrade: number;
  approvalGas: number;
};
export const COST_DEFAULTS: CostAssumptions = {
  buyTaxPct: 0,
  sellTaxPct: 0,
  dexFeePct: 0.25,
  impactPct: 0,
  gasPerTrade: 0,
  approvalGas: 0,
};
export function retained(pct: number) {
  return 1 - Math.min(100, Math.max(0, pct)) / 100;
}
export function purchasedTokens(spend: number, price: number, c: CostAssumptions) {
  return (spend / price) * retained(c.buyTaxPct) * retained(c.dexFeePct) * retained(c.impactPct);
}
/** Tokens are already net of acquisition costs: never apply buy tax again here. */
export function liquidation(tokens: number, price: number, c: CostAssumptions) {
  return (
    tokens * price * retained(c.sellTaxPct) * retained(c.dexFeePct) * retained(c.impactPct) -
    c.gasPerTrade -
    c.approvalGas
  );
}
export function immediateLossPct(spend: number, price: number, c: CostAssumptions) {
  const cost = spend + c.gasPerTrade;
  return (1 - liquidation(purchasedTokens(spend, price, c), price, c) / cost) * 100;
}
export function effectiveBreakEven(cost: number, tokens: number, c: CostAssumptions) {
  const factor = tokens * retained(c.sellTaxPct) * retained(c.dexFeePct) * retained(c.impactPct);
  return factor > 0 ? (cost + c.gasPerTrade + c.approvalGas) / factor : null;
}
export function cycleSaleQuantity(base: number, available: number, pct: number, final: boolean) {
  return final ? available : Math.min(available, (base * pct) / 100);
}
