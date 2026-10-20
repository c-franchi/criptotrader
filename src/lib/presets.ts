import { grossForNet, type TokenTax } from "./tokens";
import { EMPTY_CONFIG, type PresetId, type StrategyConfig } from "./strategy";

export type { PresetId };

export const PRESETS: { id: PresetId; name: string; summary: string; how: string[]; forWho: string }[] = [
  {
    id: "segura",
    name: "Entrada segura",
    summary: "Poucas compras, só em quedas fortes, saída rápida se der errado.",
    how: [
      "Divide o valor em 4 partes e compra 1 parte quando o preço cai 8% da máxima de 24h.",
      "No máximo 2 compras por posição e 2 operações por dia, com 4h entre compras.",
      "Vende metade com +10% e o resto com +20%. Stop-loss em -10%.",
      "Usa no máximo 50% do valor; o restante fica guardado.",
    ],
    forWho: "Para quem está começando: espera o token ficar bem mais barato antes de comprar e opera pouco. Menos chances de lucro rápido, mas menos risco.",
  },
  {
    id: "equilibrada",
    name: "Segura com alguns trades",
    summary: "Entrada cuidadosa, mas faz mais operações e protege o lucro.",
    how: [
      "Divide o valor em 5 partes e compra 1 parte a cada queda de 5% da máxima de 24h.",
      "Até 3 compras por posição e 4 operações por dia, com 90 min entre compras.",
      "Vende 40% com +6% e o resto com +12%. Stop-loss em -8%.",
      "Trailing stop: após +8%, vende se cair 4% do topo. Usa no máximo 60% do valor.",
    ],
    forWho: "Meio-termo: compra em quedas menores, faz algumas operações por dia e protege o lucro com o stop móvel. Bom depois de entender o básico.",
  },
  {
    id: "ativa",
    name: "Ativa",
    summary: "Em tendência de alta, compra nos recuos e faz várias operações curtas.",
    how: [
      "Só compra em tendência de alta (média de 9 velas de 15 min acima da de 21) e quando o preço recua até a média de 21 — compra na baixa.",
      "Até 3 compras por posição e 8 operações por dia, com 30 min entre compras.",
      "Vende metade com +4% e o resto com +8%. Stop-loss em -5%.",
      "Usa no máximo 75% do valor. Mais operações = mais taxas e mais risco.",
    ],
    forWho: "Para quem acompanha o mercado: compra nos recuos de um token que está subindo e vende rápido. Em tokens com taxa alta (ex.: 8%), muitas operações comem o lucro.",
  },
  {
    id: "adaptativa",
    name: "Adaptativa · Padrões",
    summary: "Lê o comportamento do preço e muda a forma de operar sozinha.",
    how: [
      "Preço parado (variação menor que 8%): compra na parte de baixo da faixa e vende com lucro curto (~1,5% líquido).",
      "Preço em alta: compra quando recua até a média e busca lucro maior (~4% líquido).",
      "Preço em queda: não compra. Se já tiver comprado, aceita sair com lucro pequeno (~1% líquido).",
      "Todas as metas já somam as taxas de compra e venda do token. Se a faixa for pequena demais para pagar as taxas, o robô não entra. Stop-loss em -6%.",
    ],
    forWho: "Para quem quer que o robô se adapte ao mercado sem precisar mexer na estratégia. Em tokens com taxa alta, ele opera menos, porque só entra quando dá para lucrar depois das taxas.",
  },
];

const r = (n: number) => Math.floor(n * 1e6) / 1e6;

/** Builds a full strategy from a preset and the capital (in the pair currency, e.g. WBNB). */
export function buildPreset(id: PresetId, amount: number, liquidityUsd: number | null, tax: TokenTax = { buy: 0, sell: 0 }): StrategyConfig {
  const c = buildRaw(id, amount, liquidityUsd);
  // Take-profit targets are the NET gain wanted; raise the price target so token taxes are covered.
  const tp = c.takeProfits.map((t) => ({ ...t, pct: Math.round(grossForNet(t.pct, tax) * 10) / 10 }));
  // Taxed tokens: selling at a loss pays both taxes, so the stop starts disabled (DCA + wait for recovery).
  const stopLossPct = tax.buy > 0 || tax.sell > 0 ? 0 : c.stopLossPct;
  return { ...c, takeProfits: tp, stopLossPct, buyTaxPct: tax.buy, sellTaxPct: tax.sell };
}

function buildRaw(id: PresetId, amount: number, liquidityUsd: number | null): StrategyConfig {
  const minLiq = liquidityUsd ? Math.round(liquidityUsd * 0.7) : 5000;
  const base = { ...EMPTY_CONFIG, presetId: id, sizingMode: "fixo" as const, referenceType: "maxima" as const, windowHours: 24, minLiquidityUsd: minLiq, maxSlippagePct: 2, maxPriceImpactPct: 2 };
  if (id === "segura")
    return { ...base, buyAmount: r(amount / 4), entryType: "queda", dropPct: 8, maxEntries: 2, maxTradesPerDay: 2, cooldownMin: 240, maxExposureQuote: r(amount * 0.5), takeProfits: [{ pct: 10, sellPct: 50 }, { pct: 20, sellPct: 100 }], stopLossPct: 10, dailyLossLimit: r(amount * 0.1) };
  if (id === "equilibrada")
    return { ...base, buyAmount: r(amount / 5), entryType: "queda", dropPct: 5, maxEntries: 3, maxTradesPerDay: 4, cooldownMin: 90, maxExposureQuote: r(amount * 0.6), takeProfits: [{ pct: 6, sellPct: 40 }, { pct: 12, sellPct: 100 }], stopLossPct: 8, trailingEnabled: true, trailingActivatePct: 8, trailingDistancePct: 4, dailyLossLimit: r(amount * 0.1) };
  if (id === "adaptativa")
    return { ...base, buyAmount: r(amount / 4), entryType: "adaptativa", maFast: 9, maSlow: 21, candleInterval: "15m", maxEntries: 2, maxTradesPerDay: 6, cooldownMin: 45, maxExposureQuote: r(amount * 0.6), takeProfits: [], stopLossPct: 6, dailyLossLimit: r(amount * 0.1) };
  return { ...base, buyAmount: r(amount / 4), entryType: "medias", maFast: 9, maSlow: 21, candleInterval: "15m", maxEntries: 3, maxTradesPerDay: 8, cooldownMin: 30, maxExposureQuote: r(amount * 0.75), takeProfits: [{ pct: 4, sellPct: 50 }, { pct: 8, sellPct: 100 }], stopLossPct: 5, dailyLossLimit: r(amount * 0.15) };
}
