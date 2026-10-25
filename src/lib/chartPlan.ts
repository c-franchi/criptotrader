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
    partialEntriesAccepted: z.boolean().default(false),
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
/** Suggest from the complete planned position. Partial fills are reported separately. */
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
    !d.entryPrices.length ||
    d.entryPrices.some((v) => !Number.isFinite(v) || v <= 0) ||
    d.amounts.length !== d.entryPrices.length ||
    d.amounts.some((v) => !Number.isFinite(Number(v)) || Number(v) <= 0) ||
    !Number.isInteger(exitCount) ||
    exitCount < 1 ||
    exitCount > 5
  )
    return [];
  const amount = d.amounts.reduce((sum, v) => sum + Number(v), 0);
  const quantity = d.entryPrices.reduce((sum, p, i) => sum + Number(d.amounts[i]) / p, 0);
  const highest = Math.max(...d.entryPrices);
  return Array.from({ length: exitCount }, (_, i) => {
    const model = chartProjection(
      {
        entryBnb: amount / quantity,
        amountBnb: amount,
        buyTaxPct: d.buyTaxPct,
        sellTaxPct: d.sellTaxPct,
        dexFeePct: 0.25,
        executionMarginPct: 0, // Slippage tolerance is not a mandatory charge.
        gasBuyBnb: d.gasBuyBnb * d.entryPrices.length,
        gasSellBnb: d.gasSellBnb * exitCount,
      },
      highest,
      netTargetPct * (i + 1),
    );
    // Keep targets above entry triggers, without raising them to the first-entry-only break-even.
    return model ? Math.max(model.targetBnb, highest * (1 + (i + 1) * 0.000001)) : NaN;
  }).filter((v) => Number.isFinite(v) && v > 0);
}
export type PlanProjectionInput = {
  entryPrices: number[];
  exitPrices: number[];
  amounts: string[];
  buyTaxPct: number;
  sellTaxPct: number;
  gasBuyBnb: number;
  gasSellBnb: number;
  executionMarginPct: number;
};
export function planProjection(
  d: PlanProjectionInput,
  scenario: "estimated" | "slippage" = "estimated",
) {
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
  const execution = 0.9975 * (scenario === "slippage" ? 1 - d.executionMarginPct / 100 : 1);
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
  const orders = d.amounts.reduce((sum, v) => sum + Number(v), 0);
  const grossQuantity = d.entryPrices.reduce((sum, p, i) => sum + Number(d.amounts[i]) / p, 0);
  const grossReceived = d.exitPrices.reduce(
    (sum, p, i) => sum + ((grossQuantity * shares[i]!) / 100) * p,
    0,
  );
  return {
    qty,
    cost,
    received,
    profit: received - cost,
    netPct: (received / cost - 1) * 100,
    grossProfit: grossReceived - orders,
    feeCost: grossReceived - received + d.gasBuyBnb * d.entryPrices.length,
    breakEvenBnb:
      (cost + d.gasSellBnb * d.exitPrices.length) / (qty * (1 - d.sellTaxPct / 100) * execution),
    averageBnb:
      d.amounts.reduce((s, n) => s + Number(n), 0) / (qty / ((1 - d.buyTaxPct / 100) * execution)),
  };
}
/** Additive per-entry attribution for the full plan; shared sell gas follows invested amount. */
export function planEntryResults(d: PlanProjectionInput) {
  const projection = planProjection(d);
  if (!projection) return [];
  const total = d.amounts.reduce((sum, v) => sum + Number(v), 0);
  const shares = splitExitShares(d.exitPrices.length);
  const sale = d.exitPrices.reduce((sum, p, i) => sum + (p * shares[i]!) / 100, 0);
  return d.entryPrices.map((entry, i) => {
    const amount = Number(d.amounts[i]);
    const cost = amount + d.gasBuyBnb;
    const qty = (amount / entry) * (1 - d.buyTaxPct / 100) * 0.9975;
    const received =
      qty * sale * (1 - d.sellTaxPct / 100) * 0.9975 -
      (d.gasSellBnb * d.exitPrices.length * amount) / total;
    return {
      entryBnb: entry,
      grossPct: (sale / entry - 1) * 100,
      profit: received - cost,
      netPct: (received / cost - 1) * 100,
    };
  });
}
export function planPartialScenarios(d: PlanProjectionInput) {
  return d.entryPrices.slice(0, -1).map((_, i) => ({
    entries: i + 1,
    projection: planProjection({
      ...d,
      entryPrices: d.entryPrices.slice(0, i + 1),
      amounts: d.amounts.slice(0, i + 1),
    }),
  }));
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
      projectionVersion: 2,
      partialEntriesAccepted: d.partialEntriesAccepted,
      entries: prices.map((p, i) => ({ priceBnb: p, amountBnb: allocation.amounts[i]! })),
      exits: exits.map((p, i) => ({ priceBnb: p, sharePct: shares[i]! })),
    }),
  };
}
