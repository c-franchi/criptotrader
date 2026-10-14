export type StrategyConfig = {
  sizingMode: "fixo" | "percentual";
  buyAmount: number; // quote units when fixo, % of quote balance when percentual
  entryType: "queda" | "medias";
  dropPct: number;
  referenceType: "manual" | "maxima";
  manualReference: number | null;
  windowHours: number;
  maFast: number;
  maSlow: number;
  candleInterval: string;
  minLiquidityUsd: number;
  maxEntries: number;
  cooldownMin: number;
  maxExposureQuote: number;
  gasReserveBnb: number;
  maxTradesPerDay: number;
  takeProfits: { pct: number; sellPct: number }[];
  stopLossPct: number;
  trailingEnabled: boolean;
  trailingActivatePct: number;
  trailingDistancePct: number;
  dailyLossLimit: number;
  maxSlippagePct: number;
  maxPriceImpactPct: number;
  maxGasGwei: number;
  maxRetries: number;
};

// Neutral, deliberately empty-ish defaults. Not a recommendation.
export const EMPTY_CONFIG: StrategyConfig = {
  sizingMode: "percentual",
  buyAmount: 0,
  entryType: "queda",
  dropPct: 0,
  referenceType: "maxima",
  manualReference: null,
  windowHours: 24,
  maFast: 9,
  maSlow: 21,
  candleInterval: "15m",
  minLiquidityUsd: 0,
  maxEntries: 1,
  cooldownMin: 60,
  maxExposureQuote: 0,
  gasReserveBnb: 0.005,
  maxTradesPerDay: 3,
  takeProfits: [],
  stopLossPct: 0,
  trailingEnabled: false,
  trailingActivatePct: 0,
  trailingDistancePct: 0,
  dailyLossLimit: 0,
  maxSlippagePct: 1,
  maxPriceImpactPct: 3,
  maxGasGwei: 5,
  maxRetries: 1,
};

export function describeStrategy(c: StrategyConfig, quote = "WBNB"): string[] {
  const lines: string[] = [];
  const size =
    c.sizingMode === "fixo"
      ? `${c.buyAmount} ${quote} por compra`
      : `${c.buyAmount}% do saldo disponível de ${quote} por compra`;
  if (c.entryType === "queda") {
    const ref =
      c.referenceType === "manual"
        ? `o preço de referência definido (${c.manualReference ?? "não informado"})`
        : `a máxima observada nas últimas ${c.windowHours}h`;
    lines.push(`Comprar ${size} quando o preço cair ${c.dropPct}% em relação a ${ref}.`);
  } else {
    lines.push(
      `Comprar ${size} quando a média de ${c.maFast} velas cruzar acima da média de ${c.maSlow} velas (velas de ${c.candleInterval}, apenas velas fechadas).`,
    );
  }
  lines.push(
    `Todas as condições precisam ser satisfeitas. Liquidez mínima: US$ ${c.minLiquidityUsd}. Máximo de ${c.maxEntries} entrada(s) por posição, intervalo mínimo de ${c.cooldownMin} min, até ${c.maxTradesPerDay} operações/dia. O sinal só é rearmado depois que a condição deixar de ser verdadeira.`,
  );
  if (c.takeProfits.length === 0) lines.push("Nenhum nível de take-profit configurado.");
  c.takeProfits.forEach((t, i) =>
    lines.push(
      `Take-profit ${i + 1}: ao valorizar ${t.pct}% sobre o preço médio, vender ${t.sellPct}% do saldo remanescente da posição (no máximo uma vez por ciclo).`,
    ),
  );
  lines.push(
    c.stopLossPct > 0
      ? `Stop-loss: tentar vender todo o restante se o preço cair ${c.stopLossPct}% abaixo do preço médio.`
      : "Stop-loss desativado.",
  );
  if (c.trailingEnabled)
    lines.push(
      `Trailing stop: ativa após ${c.trailingActivatePct}% de lucro; vende se cair ${c.trailingDistancePct}% da máxima após a ativação.`,
    );
  lines.push(
    `Limites: slippage máx. ${c.maxSlippagePct}%, impacto de preço máx. ${c.maxPriceImpactPct}%, gas máx. ${c.maxGasGwei} gwei, ${c.maxRetries} tentativa(s) após falha, reserva de ${c.gasReserveBnb} BNB para gas.`,
  );
  lines.push("Prioridade em gatilhos simultâneos: stop-loss > trailing stop > take-profit > nova entrada.");
  lines.push("Gatilhos tentam executar uma operação; não garantem preço, lucro nem capacidade de venda.");
  return lines;
}
