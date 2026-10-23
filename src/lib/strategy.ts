export type PresetId = "segura" | "equilibrada" | "ativa" | "adaptativa";

export type StrategyConfig = {
  guidedModel?: "dca" | "grid" | "recovery";
  rulesVersion?: 1 | 2;
  /** Explicitly enabled by the owner; absent preserves existing real cycles. */
  recovery?: {
    enabled: boolean;
    minDropPct: number;
    reboundPct: number;
    maxReboundPct: number;
    confirmationBars: number;
    minNetPct: number;
  };
  taxVerified?: boolean;
  allocationBnb?: number; // optional hard capital cap for this bot
  presetId?: PresetId | null; // which ready-made style produced this config
  buyTaxPct?: number; // token tax charged on buys (% of tokens received)
  sellTaxPct?: number; // token tax charged on sells (% of BNB received)
  sizingMode: "fixo" | "percentual";
  buyAmount: number; // quote units when fixo, % of quote balance when percentual
  entryType: "queda" | "medias" | "adaptativa";
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
  stopLossMode?: "preco" | "liquido"; // missing preserves existing price-based stops
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
  if (c.recovery?.enabled)
    lines.push(
      `Recuperação REAL: queda mínima ${c.recovery.minDropPct}%, recuperação de ${c.recovery.reboundPct}% a ${c.recovery.maxReboundPct}% da mínima e ${c.recovery.confirmationBars} fechamentos consecutivos em alta. Exige espaço até o topo anterior para meta líquida de ${c.recovery.minNetPct}% mais margem de execução estimada. Uma entrada por fundo, sem recompras neste modo. Não garante retorno ao topo.`,
    );
  const size =
    c.sizingMode === "fixo"
      ? `${c.buyAmount} ${quote} por compra`
      : `${c.buyAmount}% do saldo disponível de ${quote} por compra`;
  if (c.recovery?.enabled) {
    lines.push(
      `Tamanho da entrada: ${size}. Nenhuma compra adicional enquanto houver posição aberta.`,
    );
  } else if (c.entryType === "queda") {
    const ref =
      c.referenceType === "manual"
        ? `o preço de referência definido (${c.manualReference ?? "não informado"})`
        : `a máxima observada nas últimas ${c.windowHours}h`;
    lines.push(`Comprar ${size} quando o preço cair ${c.dropPct}% em relação a ${ref}.`);
  } else if (c.entryType === "adaptativa") {
    lines.push(
      `Comprar ${size} conforme o comportamento do preço: parado (lateral) → compra na parte de baixo da faixa e vende com ganho curto; em alta → compra no recuo até a média; em queda → não compra. As metas de venda sempre cobrem as taxas de compra e venda do token.`,
    );
  } else {
    lines.push(
      `Comprar ${size} quando a tendência estiver de alta (média de ${c.maFast} velas acima da de ${c.maSlow}) e o preço recuar até a média de ${c.maSlow} ou abaixo — compra na baixa, nunca no topo (velas de ${c.candleInterval}, apenas velas fechadas).`,
    );
  }
  lines.push(
    `Todas as condições precisam ser satisfeitas. Liquidez mínima: US$ ${c.minLiquidityUsd}. Máximo de ${c.maxEntries} entrada(s) por posição, intervalo mínimo de ${c.cooldownMin} min, limite de ${c.maxTradesPerDay} operações/dia para novas entradas; saídas continuam. ${c.rulesVersion === 2 ? "Entradas por médias exigem novo sinal após rearme." : "Ciclo legado: pode repetir entradas após o intervalo."}`,
  );
  if (c.takeProfits.length === 0) lines.push("Nenhum nível de take-profit configurado.");
  c.takeProfits.forEach((t, i) =>
    lines.push(
      `Take-profit ${i + 1}: ao valorizar ${t.pct}% sobre o preço médio, vender ${t.sellPct}% do saldo remanescente da posição (no máximo uma vez por ciclo).${c.rulesVersion !== 2 && i === c.takeProfits.length - 1 ? " No ciclo legado, o último alvo encerra toda a posição." : ""}`,
    ),
  );
  lines.push(
    c.stopLossPct > 0
      ? c.stopLossMode === "liquido"
        ? `Stop por perda líquida: tentar vender o restante ao perder ${c.stopLossPct}% sobre o preço médio, incluindo taxas de compra e venda. Estimativa sem gás, slippage e impacto; a perda executada pode ser maior. Não desliga o robô nem bloqueia saques.`
        : `Stop-loss: tentar vender todo o restante se o preço cair ${c.stopLossPct}% abaixo do preço médio.`
      : "Stop-loss desativado.",
  );
  if (c.trailingEnabled)
    lines.push(
      `Trailing stop: ativa após ${c.trailingActivatePct}% de lucro; vende se cair ${c.trailingDistancePct}% da máxima após a ativação.`,
    );
  lines.push(
    `Limites: slippage máx. ${c.maxSlippagePct}%, impacto de preço máx. ${c.maxPriceImpactPct}%, gas máx. ${c.maxGasGwei} gwei, sem repetição automática de transação pendente, reserva de ${c.gasReserveBnb} BNB para gas.`,
  );
  lines.push(
    "Prioridade em gatilhos simultâneos: stop-loss > trailing stop > take-profit > nova entrada.",
  );
  lines.push(
    "Gatilhos tentam executar uma operação; não garantem preço, lucro nem capacidade de venda.",
  );
  return lines;
}
