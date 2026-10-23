import Decimal from "decimal.js";
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
  let quantity = new Decimal(0),
    cost = new Decimal(0),
    realized = new Decimal(0),
    fees = new Decimal(0),
    complete = !truncated;
  for (const o of orders) {
    if (o.gas_bnb == null) {
      complete = false;
    } else fees = fees.plus(o.gas_bnb);
    const gas = new Decimal(o.gas_bnb ?? 0);
    if (o.status === "falhou") {
      realized = realized.minus(gas);
      continue;
    }
    if (o.status !== "confirmada") continue;
    if (o.actual_token_delta == null) {
      complete = false;
      continue;
    }
    const delta = new Decimal(o.actual_token_delta).abs();
    if (o.side === "compra") {
      quantity = quantity.plus(delta);
      cost = cost.plus(new Decimal(o.amount_in).div("1e18")).plus(gas);
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
