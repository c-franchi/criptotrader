import { z } from "zod";
const pct = z.number().finite().min(0).max(100);
export const strategySchema = z
  .object({
    sizingMode: z.enum(["fixo", "percentual"]),
    buyAmount: z.number().finite().nonnegative(),
    entryType: z.enum(["queda", "medias", "adaptativa"]),
    dropPct: pct,
    referenceType: z.enum(["manual", "maxima"]),
    manualReference: z.number().finite().positive().nullable(),
    windowHours: z.number().finite().positive().max(720),
    maFast: z.number().int().min(1).max(500),
    maSlow: z.number().int().min(2).max(1000),
    candleInterval: z.enum(["5m", "15m", "30m", "1h", "4h"]),
    minLiquidityUsd: z.number().finite().nonnegative(),
    maxEntries: z.number().int().min(1).max(100),
    cooldownMin: z.number().finite().nonnegative(),
    maxExposureQuote: z.number().finite().nonnegative(),
    gasReserveBnb: z.number().finite().nonnegative(),
    maxTradesPerDay: z.number().int().nonnegative(),
    takeProfits: z
      .array(
        z.object({
          pct: z.number().finite().positive(),
          sellPct: z.number().finite().positive().max(100),
        }),
      )
      .max(20),
    stopLossPct: z.number().finite().min(0).lt(100),
    stopLossMode: z.enum(["preco", "liquido"]).optional(),
    trailingEnabled: z.boolean(),
    trailingActivatePct: z.number().finite().nonnegative(),
    trailingDistancePct: pct,
    dailyLossLimit: z.number().finite().nonnegative(),
    maxSlippagePct: z.number().finite().min(0).max(20),
    maxPriceImpactPct: z.number().finite().min(0).max(20),
    maxGasGwei: z.number().finite().positive(),
    maxRetries: z.number().int().nonnegative(),
    buyTaxPct: z.number().finite().min(0).lt(100).optional(),
    sellTaxPct: z.number().finite().min(0).lt(100).optional(),
    recovery: z
      .object({
        enabled: z.boolean(),
        minDropPct: z.number().finite().positive().lt(100),
        reboundPct: z.number().finite().positive().lt(100),
        maxReboundPct: z.number().finite().positive().lt(100),
        confirmationBars: z.number().int().min(2).max(10),
        minNetPct: z.number().finite().positive().max(100),
      })
      .optional(),
    taxVerified: z.boolean().optional(),
    rulesVersion: z.union([z.literal(1), z.literal(2)]).optional(),
    allocationBnb: z.number().finite().nonnegative().optional(),
  })
  .passthrough()
  .superRefine((c, ctx) => {
    if (c.recovery?.enabled) {
      if (c.entryType !== "adaptativa")
        ctx.addIssue({ code: "custom", message: "Recuperação real exige estratégia adaptativa" });
      if (c.recovery.maxReboundPct < c.recovery.reboundPct)
        ctx.addIssue({ code: "custom", message: "Recuperação máxima deve ser maior que a mínima" });
    }
    if (c.sizingMode === "percentual" && c.buyAmount > 100)
      ctx.addIssue({ code: "custom", message: "Percentual de compra acima de 100%" });
    if (c.maFast >= c.maSlow)
      ctx.addIssue({ code: "custom", message: "Média rápida precisa ser menor que a lenta" });
    if (c.referenceType === "manual" && c.entryType === "queda" && c.manualReference == null)
      ctx.addIssue({ code: "custom", message: "Informe a referência manual" });
  });
