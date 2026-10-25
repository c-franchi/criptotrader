import { z } from "zod";
import { formatEther, parseEther } from "viem";
import Decimal from "decimal.js";
import { buildChartConfig, chartProjection, chartRuleSchema } from "./chartRule";
import type { StrategyConfig } from "./strategy";
import type { BotState } from "./autoStrategy";

export const planMoney = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/)
  .refine((v) => Number(v) > 0 && Number(v) <= 10000, "Informe um valor válido para a atividade.");
const price = z.number().finite().positive();
export const chartPlanInputSchema = z
  .object({
    budgetBnb: planMoney,
    entryPrices: z.array(price).min(1).max(10),
    exitPrices: z.array(price).min(1).max(5),
    stopChoice: z.enum(["price", "none"]),
    stopBnb: price.nullable(),
    buyTaxPct: z.number().finite().min(0).lt(100),
    sellTaxPct: z.number().finite().min(0).lt(100),
    taxesConfirmed: z.literal(true),
    acknowledge: z.literal(true),
    gasBuyBnb: z.number().finite().nonnegative().max(100),
    gasSellBnb: z.number().finite().nonnegative().max(100),
    executionMarginPct: z.number().finite().min(0).max(20),
    maxGasGwei: price.max(1000),
    minLiquidityUsd: z.number().finite().nonnegative(),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.entryPrices).size !== d.entryPrices.length)
      ctx.addIssue({ code: "custom", message: "Marque uma cotação diferente para cada entrada." });
    if (new Set(d.exitPrices).size !== d.exitPrices.length)
      ctx.addIssue({ code: "custom", message: "Marque uma cotação diferente para cada saída." });
    if (Math.min(...d.exitPrices) <= Math.max(...d.entryPrices))
      ctx.addIssue({
        code: "custom",
        message: "As saídas devem ficar acima de todas as entradas.",
      });
    if (d.stopChoice === "price" && (d.stopBnb == null || d.stopBnb >= Math.min(...d.entryPrices)))
      ctx.addIssue({ code: "custom", message: "O stop deve ficar abaixo de todas as entradas." });
    if (d.stopChoice === "none" && d.stopBnb != null)
      ctx.addIssue({ code: "custom", message: "Retire o stop ao escolher manter sem stop fixo." });
  });
export type ChartPlanInput = z.infer<typeof chartPlanInputSchema>;

/** Financial allocations stay in wei. The last entry receives only the rounding remainder. */
export function dividePlanBudget(
  budgetBnb: string,
  count: number,
  exits: number,
  gasBuyBnb: number,
  gasSellBnb: number,
) {
  try {
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 10 ||
      !Number.isInteger(exits) ||
      exits < 1 ||
      exits > 5 ||
      ![gasBuyBnb, gasSellBnb].every((v) => Number.isFinite(v) && v >= 0)
    )
      return null;
    const budget = parseEther(budgetBnb);
    const gasBuy = parseEther(new Decimal(gasBuyBnb).toFixed(18, Decimal.ROUND_UP));
    const gasSell = parseEther(new Decimal(gasSellBnb).toFixed(18, Decimal.ROUND_UP));
    const reserve = gasBuy * BigInt(count) + gasSell * BigInt(exits);
    const orders = budget - reserve;
    if (orders < BigInt(count)) return null;
    const each = orders / BigInt(count);
    return {
      budgetBnb: formatEther(budget),
      gasBnb: formatEther(reserve),
      ordersBnb: formatEther(orders),
      amounts: Array.from({ length: count }, (_, i) =>
        formatEther(each + (i === count - 1 ? orders % BigInt(count) : 0n)),
      ),
    };
  } catch {
    return null;
  }
}
export function splitExitShares(count: number) {
  const each = Math.floor(10000 / count);
  return Array.from(
    { length: count },
    (_, i) => (each + (i === count - 1 ? 10000 % count : 0)) / 100,
  );
}
export function planProgress(
  rule: NonNullable<StrategyConfig["chartRule"]>,
  state: Partial<BotState>,
) {
  const same = state.chartRuleConsumedId === rule.id;
  return {
    buys: same ? (state.chartEntriesDone ?? []) : [],
    sells: same ? (state.chartExitsDone ?? []) : [],
    exiting: same && !!state.chartExiting,
    finished: same && !!state.chartFinished,
  };
}
export function planGasReserve(cfg: Partial<StrategyConfig>, state: Partial<BotState>) {
  const rule = cfg.chartRule;
  if (rule?.version !== 2 || !rule.entries || !rule.exits) return null;
  const p = planProgress(rule, state);
  if (p.finished) return "0";
  const buysLeft = p.exiting ? 0 : rule.entries.filter((_, i) => !p.buys.includes(i)).length;
  const exitsLeft = rule.exits.filter((_, i) => !p.sells.includes(i)).length;
  return formatEther(
    parseEther(new Decimal(rule.gasBuyBnb).toFixed(18, Decimal.ROUND_UP)) * BigInt(buysLeft) +
      parseEther(new Decimal(rule.gasSellBnb).toFixed(18, Decimal.ROUND_UP)) * BigInt(exitsLeft),
  );
}
/** Model each possible prefix of entries so a first exit is not auto-placed below its costs. */
export function suggestPlanExits(
  d: {
    entryPrices: number[];
    amounts: string[];
    buyTaxPct: number;
    sellTaxPct: number;
    gasBuyBnb: number;
    gasSellBnb: number;
    executionMarginPct: number;
  },
  exitCount: number,
  netTargetPct: number,
) {
  if (
    !Number.isFinite(netTargetPct) ||
    netTargetPct < 0 ||
    d.entryPrices.some((v) => !(v > 0)) ||
    d.amounts.length !== d.entryPrices.length
  )
    return [];
  return Array.from({ length: exitCount }, (_, index) => {
    let required = 0;
    for (let n = 1; n <= d.entryPrices.length; n++) {
      const amount = d.amounts.slice(0, n).reduce((s, v) => s + Number(v), 0);
      const grossQuantity = d.entryPrices
        .slice(0, n)
        .reduce((s, p, i) => s + Number(d.amounts[i]) / p, 0);
      const p = chartProjection(
        {
          entryBnb: amount / grossQuantity,
          amountBnb: amount,
          buyTaxPct: d.buyTaxPct,
          sellTaxPct: d.sellTaxPct,
          dexFeePct: 0.25,
          executionMarginPct: d.executionMarginPct,
          gasBuyBnb: d.gasBuyBnb * n,
          gasSellBnb: d.gasSellBnb * exitCount,
        },
        d.entryPrices[0]!,
        netTargetPct * (index + 1),
      );
      if (!p) return NaN;
      required = Math.max(required, p.targetBnb);
    }
    return required;
  }).filter((v) => Number.isFinite(v) && v > 0);
}
export function planProjection(d: {
  entryPrices: number[];
  exitPrices: number[];
  amounts: string[];
  buyTaxPct: number;
  sellTaxPct: number;
  gasBuyBnb: number;
  gasSellBnb: number;
  executionMarginPct: number;
}) {
  if (
    !d.entryPrices.length ||
    d.amounts.length !== d.entryPrices.length ||
    !d.exitPrices.length ||
    d.amounts.some((v) => !Number.isFinite(Number(v)) || Number(v) <= 0) ||
    [...d.entryPrices, ...d.exitPrices].some((v) => !Number.isFinite(v) || v <= 0) ||
    ![d.buyTaxPct, d.sellTaxPct, d.gasBuyBnb, d.gasSellBnb, d.executionMarginPct].every(
      (v) => Number.isFinite(v) && v >= 0,
    ) ||
    d.buyTaxPct >= 100 ||
    d.sellTaxPct >= 100 ||
    d.executionMarginPct >= 100
  )
    return null;
  const execution = 0.9975 * (1 - d.executionMarginPct / 100);
  const qty = d.entryPrices.reduce(
    (s, p, i) => s + (Number(d.amounts[i]) / p) * (1 - d.buyTaxPct / 100) * execution,
    0,
  );
  const cost = d.amounts.reduce((s, n) => s + Number(n), 0) + d.gasBuyBnb * d.entryPrices.length;
  const shares = splitExitShares(d.exitPrices.length);
  const received =
    d.exitPrices.reduce(
      (s, price, i) =>
        s + ((qty * shares[i]!) / 100) * price * (1 - d.sellTaxPct / 100) * execution,
      0,
    ) -
    d.gasSellBnb * d.exitPrices.length;
  if (![qty, cost, received].every(Number.isFinite) || qty <= 0 || cost <= 0) return null;
  return {
    qty,
    cost,
    received,
    profit: received - cost,
    netPct: (received / cost - 1) * 100,
    averageBnb:
      d.amounts.reduce((s, n) => s + Number(n), 0) / (qty / ((1 - d.buyTaxPct / 100) * execution)),
  };
}
export function buildChartPlanConfig(
  raw: ChartPlanInput,
  id: string,
  base: StrategyConfig,
): StrategyConfig {
  const d = chartPlanInputSchema.parse(raw);
  const prices = [...d.entryPrices].sort((a, b) => b - a),
    exits = [...d.exitPrices].sort((a, b) => a - b);
  const allocation = dividePlanBudget(
    d.budgetBnb,
    prices.length,
    exits.length,
    d.gasBuyBnb,
    d.gasSellBnb,
  );
  if (!allocation)
    throw new Error("O valor liberado não cobre a reserva estimada de gás e todas as entradas.");
  const cfg = buildChartConfig(
    {
      ...d,
      entryBnb: prices[0]!,
      exitBnb: exits[0]!,
      amountBnb: Number(allocation.amounts[0]),
      dexFeePct: 0.25,
      costsConfirmed: true,
      reserveBnb: 0,
    },
    id,
    base,
  );
  const shares = splitExitShares(exits.length);
  return {
    ...cfg,
    maxEntries: prices.length,
    maxTradesPerDay: 0,
    allocationBnb: Number(allocation.ordersBnb),
    maxExposureQuote: Number(allocation.ordersBnb),
    chartRule: chartRuleSchema.parse({
      ...cfg.chartRule,
      version: 2,
      entries: prices.map((p, i) => ({ priceBnb: p, amountBnb: allocation.amounts[i]! })),
      exits: exits.map((p, i) => ({ priceBnb: p, sharePct: shares[i]! })),
    }),
  };
}
