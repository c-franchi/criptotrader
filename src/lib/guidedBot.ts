import { z } from "zod";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";
import { grossForNet } from "./tokens";
import { WBNB } from "./pancake";

export const incompatibleBotToken = (token: string) => token.toLowerCase() === WBNB.toLowerCase();
export const INCOMPATIBLE_BNB =
  "Este robô paga com BNB para comprar outra moeda. BNB e WBNB representam o mesmo ativo; esta combinação não permite negociar a variação do BNB em dólares. Escolha outra moeda com par BNB compatível.";
export const guidedModelSchema = z.enum(["dca", "grid", "recovery"]);
export type GuidedModel = z.infer<typeof guidedModelSchema>;
const positive = z.number().finite().positive("Informe um valor maior que zero.");
const pct = positive.lt(100);
export const guidedInputSchema = z
  .object({
    model: guidedModelSchema,
    capital: positive,
    buyAmount: positive,
    dropPct: pct,
    maxEntries: z.number().int().min(1).max(100),
    cooldownMin: z.number().finite().min(0).max(10080),
    maxTradesPerDay: z.number().int().min(1).max(1000),
    profitPct: pct,
    stopPct: pct,
    minLiquidityUsd: z.number().finite().nonnegative().optional(),
    maxGasGwei: z.number().finite().positive().max(1000).optional(),
    reserve: z.number().finite().nonnegative(),
    buyTax: z.number().finite().min(0).lt(100),
    sellTax: z.number().finite().min(0).lt(100),
    taxConfirmed: z.literal(true),
    lower: z.number().finite().nonnegative(),
    upper: z.number().finite().nonnegative(),
    levels: z.number().int().min(2).max(100),
    reboundPct: pct,
    maxReboundPct: pct,
    confirmationBars: z.number().int().min(2).max(10),
  })
  .superRefine((d, ctx) => {
    if (d.buyAmount > d.capital)
      ctx.addIssue({
        code: "custom",
        path: ["buyAmount"],
        message: "A compra não pode superar o capital do robô.",
      });
    if (
      d.model !== "grid" &&
      d.buyAmount * (d.model === "recovery" ? 1 : d.maxEntries) > d.capital + 1e-15
    )
      ctx.addIssue({
        code: "custom",
        path: ["buyAmount"],
        message: "A soma das compras supera o capital. Reduza o valor ou a quantidade de compras.",
      });
    if (d.model === "grid" && !(d.upper > d.lower && d.lower > 0))
      ctx.addIssue({
        code: "custom",
        path: ["lower"],
        message: "Defina uma faixa válida, com máximo maior que mínimo.",
      });
    if (d.model === "recovery" && d.maxReboundPct < d.reboundPct)
      ctx.addIssue({
        code: "custom",
        path: ["maxReboundPct"],
        message: "A recuperação máxima precisa ser maior que a mínima.",
      });
  });
export type GuidedInput = z.infer<typeof guidedInputSchema>;
/** Transparent mappings to existing execution rules; never silently disables a protection. */
export function buildGuidedConfig(input: GuidedInput): StrategyConfig {
  const d = guidedInputSchema.parse(input);
  return {
    ...EMPTY_CONFIG,
    rulesVersion: 2,
    presetId: null,
    guidedModel: d.model,
    allocationBnb: d.capital,
    maxExposureQuote: d.capital,
    sizingMode: "fixo",
    buyAmount: d.buyAmount,
    entryType: d.model === "recovery" ? "adaptativa" : "queda",
    dropPct: d.dropPct,
    maxEntries: d.model === "recovery" ? 1 : d.maxEntries,
    cooldownMin: d.cooldownMin,
    maxTradesPerDay: d.maxTradesPerDay,
    gasReserveBnb: d.reserve,
    minLiquidityUsd: d.minLiquidityUsd ?? 5000,
    maxGasGwei: d.maxGasGwei ?? EMPTY_CONFIG.maxGasGwei,
    buyTaxPct: d.buyTax,
    sellTaxPct: d.sellTax,
    taxVerified: true,
    takeProfits: [
      { pct: grossForNet(d.profitPct, { buy: d.buyTax, sell: d.sellTax }), sellPct: 100 },
    ],
    stopLossMode: "preco",
    stopLossPct: d.stopPct,
    ...(d.model === "recovery"
      ? {
          recovery: {
            enabled: true,
            minDropPct: d.dropPct,
            reboundPct: d.reboundPct,
            maxReboundPct: d.maxReboundPct,
            confirmationBars: d.confirmationBars,
            minNetPct: d.profitPct,
          },
        }
      : {}),
  } as StrategyConfig;
}
/** Price movement margin after token taxes; gas is assessed separately. */
export function gridMarginPct(
  lower: number,
  upper: number,
  levels: number,
  price: number,
  buyTax: number,
  sellTax: number,
) {
  if (!(price > 0 && upper > lower && levels >= 2)) return 0;
  return (
    ((1 + (upper - lower) / levels / price) * (1 - buyTax / 100) * (1 - sellTax / 100) - 1) * 100
  );
}
export function knownFeeConsumesMargin(amount: number, marginPct: number, fee: number | null) {
  return fee != null && amount > 0 && fee >= (amount * marginPct) / 100;
}

export function guidedGridExit(
  cfg: Partial<StrategyConfig> | null | undefined,
  state: { tokens?: number; avgPriceUsd?: number },
  priceBnb: number,
) {
  if (
    cfg?.guidedModel !== "grid" ||
    !(Number(state.tokens) > 0) ||
    !(Number(state.avgPriceUsd) > 0)
  )
    return null;
  const change = (priceBnb / Number(state.avgPriceUsd) - 1) * 100;
  if ((cfg.stopLossPct ?? 0) > 0 && change <= -cfg.stopLossPct!)
    return "Proteção da faixa: vender a posição após a queda configurada do preço médio em BNB.";
  if (cfg.takeProfits?.some((t) => t.pct > 0 && change >= t.pct))
    return "Meta da faixa atingida: vender a posição pelo ganho configurado sobre o preço médio em BNB.";
  return null;
}
