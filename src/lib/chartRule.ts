import { z } from "zod";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";
const positive = z.number().finite().positive();
const fee = z.number().finite().min(0).lt(100);
export const chartRuleSchema = z
  .object({
    id: z.string().uuid(),
    unit: z.literal("BNB"),
    entryBnb: positive,
    exitBnb: positive,
    stopBnb: positive.nullable(),
    dexFeePct: fee,
    executionMarginPct: z.number().finite().min(0).max(20),
    gasBuyBnb: z.number().finite().nonnegative(),
    gasSellBnb: z.number().finite().nonnegative(),
    version: z.literal(2).optional(),
    projectionVersion: z.literal(2).optional(),
    partialEntriesAccepted: z.boolean().optional(),
    entries: z
      .array(
        z.object({
          priceBnb: positive,
          amountBnb: z
            .string()
            .regex(/^\d+(\.\d{1,18})?$/)
            .refine((v) => Number(v) > 0 && Number.isFinite(Number(v))),
        }),
      )
      .min(1)
      .max(10)
      .optional(),
    exits: z
      .array(z.object({ priceBnb: positive, sharePct: z.number().finite().positive().max(100) }))
      .min(1)
      .max(5)
      .optional(),
  })
  .superRefine((r, ctx) => {
    if (r.version === 2) {
      if (!r.entries?.length || !r.exits?.length)
        ctx.addIssue({
          code: "custom",
          message: "Defina todas as entradas e saídas da atividade.",
        });
      if (r.entries?.some((e, i, all) => i > 0 && e.priceBnb >= all[i - 1]!.priceBnb))
        ctx.addIssue({
          code: "custom",
          message: "As entradas devem ter preços diferentes, da maior para a menor.",
        });
      if (r.exits?.some((e, i, all) => i > 0 && e.priceBnb <= all[i - 1]!.priceBnb))
        ctx.addIssue({
          code: "custom",
          message: "As saídas devem ter preços diferentes, da menor para a maior.",
        });
      if (Math.abs((r.exits ?? []).reduce((sum, e) => sum + e.sharePct, 0) - 100) > 1e-7)
        ctx.addIssue({ code: "custom", message: "A divisão das saídas deve somar 100%." });
      if (r.entries?.[0]?.priceBnb !== r.entryBnb || r.exits?.[0]?.priceBnb !== r.exitBnb)
        ctx.addIssue({
          code: "custom",
          message: "Os níveis principais precisam corresponder aos pontos da atividade.",
        });
      if (r.stopBnb != null && r.entries?.length && r.stopBnb >= r.entries.at(-1)!.priceBnb)
        ctx.addIssue({ code: "custom", message: "O stop deve ficar abaixo de todas as entradas." });
    } else if (r.entries || r.exits)
      ctx.addIssue({ code: "custom", message: "A atividade com vários pontos exige versão 2." });
    if (r.exitBnb <= r.entryBnb)
      ctx.addIssue({
        code: "custom",
        message:
          "A saída deve ficar acima da entrada. Para proteger uma queda, use o stop opcional.",
      });
    if (r.stopBnb != null && r.stopBnb >= r.entryBnb)
      ctx.addIssue({ code: "custom", message: "O stop deve ficar abaixo da entrada." });
  });
export type ChartRule = z.infer<typeof chartRuleSchema>;
export const chartRuleInputSchema = z
  .object({
    entryBnb: positive,
    exitBnb: positive,
    stopBnb: positive.nullable(),
    stopChoice: z.enum(["price", "none"]),
    amountBnb: positive.max(10000),
    buyTaxPct: fee,
    sellTaxPct: fee,
    taxesConfirmed: z.literal(true),
    dexFeePct: z.literal(0.25),
    executionMarginPct: z.number().finite().min(0).max(20),
    gasBuyBnb: z.number().finite().min(0).max(100),
    gasSellBnb: z.number().finite().min(0).max(100),
    costsConfirmed: z.literal(true),
    reserveBnb: z.number().finite().min(0).max(100),
    maxGasGwei: positive.max(1000),
    minLiquidityUsd: z.number().finite().nonnegative(),
    acknowledge: z.literal(true),
  })
  .superRefine((r, ctx) => {
    if (r.exitBnb <= r.entryBnb)
      ctx.addIssue({
        code: "custom",
        path: ["exitBnb"],
        message: "Marque a saída acima da entrada.",
      });
    if (r.stopChoice === "price" && (r.stopBnb == null || r.stopBnb >= r.entryBnb))
      ctx.addIssue({
        code: "custom",
        path: ["stopBnb"],
        message: "Marque o stop abaixo da entrada ou escolha manter sem stop.",
      });
    if (r.stopChoice === "none" && r.stopBnb != null)
      ctx.addIssue({
        code: "custom",
        path: ["stopBnb"],
        message: "Remova o ponto de stop ao escolher manter sem stop.",
      });
  });
export type ChartRuleInput = z.infer<typeof chartRuleInputSchema>;
export type ChartCostInput = {
  entryBnb: number;
  amountBnb: number;
  buyTaxPct: number;
  sellTaxPct: number;
  dexFeePct: number;
  executionMarginPct: number;
  gasBuyBnb: number;
  gasSellBnb: number;
};

/** Projection in BNB, never an executable quote. Each fee is applied once per leg. */
export function chartProjection(c: ChartCostInput, exitBnb: number, targetNetPct = 0) {
  if (
    [
      c.entryBnb,
      c.amountBnb,
      c.buyTaxPct,
      c.sellTaxPct,
      c.dexFeePct,
      c.executionMarginPct,
      c.gasBuyBnb,
      c.gasSellBnb,
    ].some((n) => !Number.isFinite(n) || n < 0) ||
    !(c.entryBnb > 0) ||
    !(c.amountBnb > 0) ||
    !(exitBnb > 0) ||
    !Number.isFinite(exitBnb) ||
    !Number.isFinite(targetNetPct)
  )
    return null;
  if ([c.buyTaxPct, c.sellTaxPct, c.dexFeePct, c.executionMarginPct].some((f) => f >= 100))
    return null;
  const execution = (1 - c.dexFeePct / 100) * (1 - c.executionMarginPct / 100);
  const quantity = (c.amountBnb / c.entryBnb) * (1 - c.buyTaxPct / 100) * execution;
  const sellFactor = (1 - c.sellTaxPct / 100) * execution;
  const invested = c.amountBnb + c.gasBuyBnb;
  const breakEvenBnb = (invested + c.gasSellBnb) / (quantity * sellFactor);
  const targetBnb = (invested * (1 + targetNetPct / 100) + c.gasSellBnb) / (quantity * sellFactor);
  const receivedBnb = quantity * exitBnb * sellFactor - c.gasSellBnb;
  const profitBnb = receivedBnb - invested;
  const out = {
    quantity,
    invested,
    receivedBnb,
    profitBnb,
    netPct: (profitBnb / invested) * 100,
    breakEvenBnb,
    targetBnb,
    risePct: (exitBnb / c.entryBnb - 1) * 100,
  };
  return Object.values(out).every(Number.isFinite) ? out : null;
}
/** Held tokens already reflect buy tax; known buy gas is already in recorded cost. */
export function heldChartProjection(
  quantity: number,
  costBnb: number,
  exitBnb: number,
  sellTaxPct: number,
  dexFeePct: number,
  executionMarginPct: number,
  gasSellBnb: number,
) {
  if (
    ![quantity, costBnb, exitBnb].every((n) => Number.isFinite(n) && n > 0) ||
    ![sellTaxPct, dexFeePct, executionMarginPct, gasSellBnb].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    [sellTaxPct, dexFeePct, executionMarginPct].some((n) => n >= 100)
  )
    return null;
  const received =
    quantity *
      exitBnb *
      (1 - sellTaxPct / 100) *
      (1 - dexFeePct / 100) *
      (1 - executionMarginPct / 100) -
    gasSellBnb;
  return { received, profitBnb: received - costBnb, netPct: (received / costBnb - 1) * 100 };
}
export function buildChartConfig(
  input: ChartRuleInput,
  id: string,
  base: StrategyConfig = EMPTY_CONFIG,
): StrategyConfig {
  const d = chartRuleInputSchema.parse(input);
  return {
    ...base,
    guidedModel: "chart",
    rulesVersion: 2,
    presetId: null,
    recovery: {
      enabled: false,
      minDropPct: 1,
      reboundPct: 1,
      maxReboundPct: 2,
      confirmationBars: 2,
      minNetPct: 1,
    },
    sizingMode: "fixo",
    buyAmount: d.amountBnb,
    allocationBnb: d.amountBnb,
    maxExposureQuote: d.amountBnb,
    maxEntries: 1,
    entryType: "queda",
    referenceType: "maxima",
    manualReference: null,
    dropPct: 0,
    cooldownMin: 0,
    maxTradesPerDay: 2,
    takeProfits: [{ pct: (d.exitBnb / d.entryBnb - 1) * 100, sellPct: 100 }],
    stopLossPct: d.stopBnb == null ? 0 : (1 - d.stopBnb / d.entryBnb) * 100,
    stopLossMode: "preco",
    trailingEnabled: false,
    buyTaxPct: d.buyTaxPct,
    sellTaxPct: d.sellTaxPct,
    taxVerified: true,
    gasReserveBnb: d.reserveBnb,
    maxGasGwei: d.maxGasGwei,
    minLiquidityUsd: d.minLiquidityUsd,
    maxSlippagePct: d.executionMarginPct,
    chartRule: chartRuleSchema.parse({
      id,
      unit: "BNB",
      entryBnb: d.entryBnb,
      exitBnb: d.exitBnb,
      stopBnb: d.stopBnb,
      dexFeePct: d.dexFeePct,
      executionMarginPct: d.executionMarginPct,
      gasBuyBnb: d.gasBuyBnb,
      gasSellBnb: d.gasSellBnb,
    }),
  };
}
