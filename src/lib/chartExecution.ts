import Decimal from "decimal.js";
import { formatEther, formatUnits, parseEther } from "viem";
import { z } from "zod";
import type { StrategyConfig } from "./strategy";
import type { BotState } from "./autoStrategy";
import { planProgress } from "./chartPlan";
const decimal = z.string().refine((v) => {
  try {
    const n = new Decimal(v);
    return n.isFinite() && n.gte(0);
  } catch {
    return false;
  }
});
const basisSchema = z.object({
  version: z.literal(1),
  decimals: z.number().int().min(0).max(255),
  futureTokens: decimal,
  futureCostBnb: decimal,
  targetPriceBnb: decimal.refine((v) => new Decimal(v).gt(0)),
  spotPriceBnb: decimal.refine((v) => new Decimal(v).gt(0)),
  sellTaxPct: z.number().finite().min(0).lt(100),
});
/** Known holdings plus unfilled planned purchases, excluding the current buy and its gas.
 * Future entries are conditional, not guaranteed; the editor separately discloses partial-fill losses.
 */
export function chartExecutionBasis(
  cfg: StrategyConfig,
  state: BotState,
  index: number,
  spot: number,
  decimals: number,
) {
  const rule = cfg.chartRule;
  if (rule?.version !== 2 || rule.projectionVersion !== 2 || !rule.entries || !rule.exits)
    return null;
  const p = planProgress(rule, state);
  if (!rule.entries[index] || p.buys.includes(index) || p.exiting || p.finished || p.sells.length)
    throw new Error("A atividade não permite esta nova entrada. Confira o estado do robô.");
  const future = rule.entries.filter((_, i) => i !== index && !p.buys.includes(i));
  let tokens = new Decimal(
    state.tokensRaw != null ? formatUnits(BigInt(state.tokensRaw), decimals) : state.tokens,
  );
  let cost = new Decimal(state.costBnb).plus(new Decimal(rule.gasSellBnb).mul(rule.exits.length));
  for (const e of future) {
    tokens = tokens.plus(
      new Decimal(e.amountBnb)
        .div(e.priceBnb)
        .mul(1 - (cfg.buyTaxPct ?? 0) / 100)
        .mul(0.9975),
    );
    cost = cost.plus(e.amountBnb).plus(rule.gasBuyBnb);
  }
  return basisSchema.parse({
    version: 1,
    decimals,
    futureTokens: tokens.toFixed(),
    futureCostBnb: cost.toFixed(),
    targetPriceBnb: rule.exits
      .reduce(
        (sum, e) => sum.plus(new Decimal(e.priceBnb).mul(e.sharePct).div(100)),
        new Decimal(0),
      )
      .toFixed(),
    spotPriceBnb: new Decimal(spot).toFixed(),
    sellTaxPct: cfg.sellTaxPct ?? 0,
  });
}
/** Keep an actual gas ceiling for the whole plan using the current executable buy/reverse quote.
 * The current quote already includes buy DEX fees/tax; held tokens are never taxed as new buys.
 */
export function chartMaxBuyFeeRaw(
  raw: unknown,
  amountIn: bigint,
  netTokens: bigint,
  reverseBnb: bigint,
) {
  const b = basisSchema.parse(raw);
  if (amountIn <= 0n || netTokens <= 0n || reverseBnb <= 0n)
    throw new Error("Cotação da atividade indisponível; compra não enviada.");
  const qty = new Decimal(formatUnits(netTokens, b.decimals));
  const quotedSellFactor = new Decimal(formatEther(reverseBnb)).div(qty.mul(b.spotPriceBnb));
  const sellFactor = Decimal.min(new Decimal(1 - b.sellTaxPct / 100).mul(0.9975), quotedSellFactor);
  const sale = new Decimal(b.futureTokens).plus(qty).mul(b.targetPriceBnb).mul(sellFactor);
  const budget = sale.minus(b.futureCostBnb).minus(formatEther(amountIn));
  if (!budget.isFinite() || budget.lte(0))
    throw new Error(
      "A cotação atual consome a margem estimada do conjunto. Compra não enviada; os pontos de saída foram mantidos.",
    );
  const fee = parseEther(budget.toFixed(18, Decimal.ROUND_DOWN));
  if (fee <= 0n)
    throw new Error("A margem do conjunto não cobre a taxa da compra. Nada foi enviado.");
  return fee.toString();
}
