import Decimal from "decimal.js";
const LedgerDecimal = Decimal.clone({ precision: 100 });
import type { PerformanceOrder } from "./botPerformance";
export type CycleOrder = PerformanceOrder & {
  id: string;
  created_at: string;
  quoted_out?: string;
  tx_hash?: string | null;
};
/** A cycle ends only when all acquired units have actually been sold. No quotes become cash. */
export function closedBotCycles(orders: CycleOrder[], truncated = false) {
  const cycles: {
    id: string;
    closedAt: string;
    buys: number;
    invested: string;
    gas: string | null;
    received: string | null;
    net: string | null;
    percent: string | null;
    pendingHashes: string[];
    complete: boolean;
  }[] = [];
  let quantity = new LedgerDecimal(0),
    invested = new LedgerDecimal(0),
    gas = new LedgerDecimal(0),
    received = new LedgerDecimal(0),
    buys = 0,
    complete = !truncated,
    missingGas = false,
    missingProceeds = false;
  let pendingHashes: string[] = [];
  for (const o of [...orders].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )) {
    if (o.status !== "confirmada" && o.status !== "falhou") continue;
    if (o.actual_token_delta == null && o.status === "confirmada") {
      complete = false;
      continue;
    }
    const delta = new LedgerDecimal(o.actual_token_delta ?? 0).abs();
    if (
      o.status === "confirmada" &&
      o.side === "venda" &&
      (quantity.lte(0) || delta.gt(quantity))
    ) {
      complete = false;
      continue;
    }
    if (o.gas_bnb == null) {
      missingGas = true;
      complete = false;
    } else gas = gas.plus(o.gas_bnb);
    if (o.status === "falhou") continue;
    if (o.side === "compra") {
      quantity = quantity.plus(delta);
      invested = invested.plus(new LedgerDecimal(o.amount_in).div("1e18"));
      buys++;
      continue;
    }
    if (o.actual_bnb_received == null) {
      complete = false;
      missingProceeds = true;
      if (o.tx_hash) pendingHashes.push(o.tx_hash);
    } else received = received.plus(o.actual_bnb_received);
    quantity = quantity.minus(delta);
    if (!quantity.isZero()) continue;
    const net = complete ? received.minus(invested).minus(gas) : null;
    cycles.push({
      id: o.id,
      closedAt: o.created_at,
      buys,
      invested: invested.toFixed(),
      gas: missingGas ? null : gas.toFixed(),
      received: missingProceeds || truncated ? null : received.toFixed(),
      net: net?.toFixed() ?? null,
      percent: net && invested.gt(0) ? net.div(invested).mul(100).toFixed(2) : null,
      pendingHashes,
      complete,
    });
    invested = new LedgerDecimal(0);
    gas = new LedgerDecimal(0);
    received = new LedgerDecimal(0);
    buys = 0;
    complete = !truncated;
    missingGas = false;
    missingProceeds = false;
    pendingHashes = [];
  }
  return cycles.reverse();
}
