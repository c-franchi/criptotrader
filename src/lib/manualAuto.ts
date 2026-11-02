import { z } from "zod";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";
import type { BotState, Decision } from "./autoStrategy";

export const manualAutoRuleSchema = z
  .object({
    id: z.string().uuid(),
    entryMode: z.enum(["price", "percent"]),
    entryValue: z.number().finite().positive(),
    referenceUsd: z.number().finite().positive(),
    exitMode: z.enum(["price", "percent"]),
    exitValue: z.number().finite().gt(-100),
    stopLossPct: z.number().finite().positive().lt(100).nullable(),
  })
  .superRefine((r, ctx) => {
    if (r.entryMode === "percent" && r.entryValue >= 100)
      ctx.addIssue({
        code: "custom",
        path: ["entryValue"],
        message: "A queda deve ser menor que 100%.",
      });
    if (r.exitMode === "price" && r.exitValue <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["exitValue"],
        message: "Informe um preço de saída maior que zero.",
      });
  });
export type ManualAutoRule = z.infer<typeof manualAutoRuleSchema>;
export const manualAutoInputSchema = z.object({
  buyTaxPct: z.number().finite().min(0).lt(100).optional(),
  sellTaxPct: z.number().finite().min(0).lt(100).optional(),
  capitalBnb: z.number().finite().positive(),
  entryMode: z.enum(["price", "percent"]),
  entryValue: z.number().finite().positive(),
  exitMode: z.enum(["price", "percent"]),
  exitValue: z.number().finite().gt(-100),
  stopLossPct: z.number().finite().positive().lt(100).nullable(),
  slippagePct: z.number().finite().min(0.1).max(20),
});
export type ManualAutoInput = z.infer<typeof manualAutoInputSchema>;
export function buildManualAutoConfig(
  input: ManualAutoInput,
  referenceUsd: number,
  id: string,
): StrategyConfig {
  const d = manualAutoInputSchema.parse(input);
  const manualAuto = manualAutoRuleSchema.parse({ ...d, referenceUsd, id });
  return {
    ...EMPTY_CONFIG,
    ...(d.buyTaxPct != null ? { buyTaxPct: d.buyTaxPct } : {}),
    ...(d.sellTaxPct != null ? { sellTaxPct: d.sellTaxPct } : {}),
    guidedModel: "manual",
    manualAuto,
    rulesVersion: 2,
    sizingMode: "fixo",
    buyAmount: d.capitalBnb,
    allocationBnb: d.capitalBnb,
    maxExposureQuote: d.capitalBnb,
    gasReserveBnb: 0,
    maxEntries: 1,
    cooldownMin: 0,
    maxTradesPerDay: 0,
    minLiquidityUsd: 0,
    maxPriceImpactPct: 0,
    maxSlippagePct: d.slippagePct,
    takeProfits: [],
    stopLossPct: d.stopLossPct ?? 0,
    stopLossMode: "preco",
  };
}
export function manualAutoEntry(r: ManualAutoRule) {
  return r.entryMode === "price" ? r.entryValue : r.referenceUsd * (1 - r.entryValue / 100);
}
/** One explicit buy/sell cycle. No indicators, profitability floor or automatic price adjustment. */
export function decideManualAuto(r: ManualAutoRule, s: BotState, priceUsd: number): Decision {
  const holding = s.tokens > 0 && s.avgPriceUsd > 0;
  if (holding) {
    if (r.stopLossPct != null && priceUsd <= s.avgPriceUsd * (1 - r.stopLossPct / 100))
      return {
        action: "venda",
        all: true,
        sellPct: 100,
        manualRuleId: r.id,
        reason: "Stop loss escolhido no Manual automático atingido.",
      };
    const exit = r.exitMode === "price" ? r.exitValue : s.avgPriceUsd * (1 + r.exitValue / 100);
    const hit = r.exitMode === "percent" && r.exitValue < 0 ? priceUsd <= exit : priceUsd >= exit;
    return hit
      ? {
          action: "venda",
          all: true,
          sellPct: 100,
          manualRuleId: r.id,
          reason: "Preço de saída escolhido no Manual automático atingido.",
        }
      : { action: "nenhuma", reason: `Manual automático: aguardando saída em US$ ${exit}.` };
  }
  if (s.manualRuleConsumedId === r.id)
    return {
      action: "nenhuma",
      reason: "Manual automático concluído. Configure outra atividade para comprar novamente.",
    };
  return priceUsd <= manualAutoEntry(r)
    ? {
        action: "compra",
        manualRuleId: r.id,
        reason: "Preço de entrada escolhido no Manual automático atingido.",
      }
    : {
        action: "nenhuma",
        reason: `Manual automático: aguardando entrada em US$ ${manualAutoEntry(r)}.`,
      };
}
