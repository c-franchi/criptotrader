import Decimal from "decimal.js";
const LedgerDecimal = Decimal.clone({ precision: 100 });
export type PerformanceOrder = {
  side: string;
  status: string;
  amount_in: string;
  actual_token_delta: string | null;
  actual_bnb_received: string | number | null;
  gas_bnb: string | number | null;
};
/** Actual wallet proceeds only. Router quotes are never treated as realized cash. */
export function botPerformance(
  orders: PerformanceOrder[],
  positionCost: number,
  tokens: number,
  priceUsd: number | null,
  bnbUsd: number | null,
  truncated = false,
) {
  let quantity = new LedgerDecimal(0),
    cost = new LedgerDecimal(0),
    realized = new LedgerDecimal(0),
    fees = new LedgerDecimal(0),
    complete = !truncated;
  for (const o of orders) {
    if (o.gas_bnb == null) {
      complete = false;
    } else fees = fees.plus(o.gas_bnb);
    const gas = new LedgerDecimal(o.gas_bnb ?? 0);
    if (o.status === "falhou") {
      realized = realized.minus(gas);
      continue;
    }
    if (o.status !== "confirmada") continue;
    if (o.actual_token_delta == null) {
      complete = false;
      continue;
    }
    const delta = new LedgerDecimal(o.actual_token_delta).abs();
    if (o.side === "compra") {
      quantity = quantity.plus(delta);
      cost = cost.plus(new LedgerDecimal(o.amount_in).div("1e18")).plus(gas);
    } else {
      if (quantity.lte(0) || delta.gt(quantity) || o.actual_bnb_received == null) {
        complete = false;
        continue;
      }
      const soldCost = cost.mul(delta).div(quantity);
      realized = realized.plus(o.actual_bnb_received).minus(gas).minus(soldCost);
      quantity = quantity.minus(delta);
      cost = cost.minus(soldCost);
    }
  }
  const open =
    tokens <= 0
      ? 0
      : priceUsd != null && bnbUsd != null && bnbUsd > 0
        ? (tokens * priceUsd) / bnbUsd - positionCost
        : null;
  return {
    realized: complete ? realized.toNumber() : null,
    open,
    total: complete && open != null ? realized.toNumber() + open : null,
    fees: orders.some((o) => o.gas_bnb == null) ? null : fees.toNumber(),
    complete,
  };
}
