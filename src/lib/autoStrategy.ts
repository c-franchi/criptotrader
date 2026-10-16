import type { StrategyConfig } from "./strategy";
import type { Candle } from "./backtest";

/** Robot memory between ticks, saved per bot. Prices in USD, amounts in BNB / token units. */
export type BotState = {
  entries: number;
  costBnb: number; // BNB spent on the open position
  tokens: number; // tokens bought and still held by the position
  avgPriceUsd: number; // average entry price
  lastBuyUsd: number;
  peakUsd: number; // highest price since entry (trailing stop)
  tpDone: number[]; // take-profit indexes already executed
  day: string; // UTC yyyy-mm-dd of the counters below
  tradesToday: number;
  lossTodayBnb: number;
  lastTradeAt: number; // ms
};

export const EMPTY_STATE: BotState = { entries: 0, costBnb: 0, tokens: 0, avgPriceUsd: 0, lastBuyUsd: 0, peakUsd: 0, tpDone: [], day: "", tradesToday: 0, lossTodayBnb: 0, lastTradeAt: 0 };

export type Decision =
  | { action: "nenhuma"; reason: string }
  | { action: "compra"; reason: string }
  | { action: "venda"; reason: string; sellPct: number; tpIndex?: number; all: boolean };

export type Market = { priceUsd: number; liquidityUsd: number | null; high: number | null; closes: number[]; now: number };

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n: number) => `${Math.round(n * 10) / 10}%`;

export function normalizeState(raw: unknown, now: number): BotState {
  const s = { ...EMPTY_STATE, ...(raw && typeof raw === "object" ? (raw as Partial<BotState>) : {}) };
  const day = new Date(now).toISOString().slice(0, 10);
  if (s.day !== day) return { ...s, day, tradesToday: 0, lossTodayBnb: 0 };
  return s;
}

/** Groups candles (oldest first) into buckets of `minutes`, returning closes of complete buckets only. */
export function closesAt(candles: Candle[], minutes: number, now: number): number[] {
  const size = minutes * 60;
  const nowBucket = Math.floor(now / 1000 / size);
  const map = new Map<number, number>();
  for (const c of candles) {
    const b = Math.floor(c[0] / size);
    if (b < nowBucket) map.set(b, c[4]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

export const intervalMinutes = (s: string) => { const m = /^(\d+)(m|h)$/.exec(s); return m ? Number(m[1]) * (m[2] === "h" ? 60 : 1) : 15; };

/** One decision per tick, following the saved strategy. Never more than one action. */
export function decide(cfg: StrategyConfig, s: BotState, m: Market): Decision {
  const p = m.priceUsd;
  if (!(p > 0)) return { action: "nenhuma", reason: "Preço indisponível — aguardando" };
  if (cfg.minLiquidityUsd > 0 && (m.liquidityUsd == null || m.liquidityUsd < cfg.minLiquidityUsd))
    return { action: "nenhuma", reason: "Liquidez do pool abaixo do mínimo da estratégia" };
  if (cfg.maxTradesPerDay > 0 && s.tradesToday >= cfg.maxTradesPerDay) return { action: "nenhuma", reason: `Limite de ${cfg.maxTradesPerDay} operações por dia atingido` };

  const holding = s.tokens > 0 && s.avgPriceUsd > 0;
  if (holding) {
    const change = (p / s.avgPriceUsd - 1) * 100;
    if (cfg.stopLossPct > 0 && change <= -cfg.stopLossPct + 1e-9) return { action: "venda", reason: `Stop-loss: caiu ${fmt(-change)} do preço médio`, sellPct: 100, all: true };
    const peak = Math.max(s.peakUsd, p);
    if (cfg.trailingEnabled && cfg.trailingDistancePct > 0 && peak >= s.avgPriceUsd * (1 + cfg.trailingActivatePct / 100) && p <= peak * (1 - cfg.trailingDistancePct / 100))
      return { action: "venda", reason: `Trailing stop: recuou ${fmt((1 - p / peak) * 100)} do topo`, sellPct: 100, all: true };
    const tps = cfg.takeProfits.map((t, i) => ({ ...t, i })).filter((t) => t.pct > 0 && !s.tpDone.includes(t.i)).sort((a, b) => a.pct - b.pct);
    const hit = tps.find((t) => change >= t.pct - 1e-9);
    if (hit) {
      const last = tps.length === 1 || hit.sellPct >= 100;
      return { action: "venda", reason: `Take-profit ${hit.i + 1}: subiu ${fmt(change)} (meta +${hit.pct}%)`, sellPct: last ? 100 : hit.sellPct, tpIndex: hit.i, all: last };
    }
  }

  if (cfg.cooldownMin > 0 && m.now - s.lastTradeAt < cfg.cooldownMin * 60_000) return { action: "nenhuma", reason: `Pausa entre operações (${cfg.cooldownMin} min)` };
  if (s.entries >= Math.max(1, cfg.maxEntries)) return { action: "nenhuma", reason: holding ? "Posição aberta — esperando meta de venda ou stop" : "Máximo de compras atingido" };
  if (cfg.maxExposureQuote > 0 && s.costBnb >= cfg.maxExposureQuote) return { action: "nenhuma", reason: "Limite de BNB investido atingido" };
  if (cfg.dailyLossLimit > 0 && s.lossTodayBnb >= cfg.dailyLossLimit) return { action: "nenhuma", reason: "Limite de perda do dia atingido — compras pausadas" };
  if (!(cfg.buyAmount > 0)) return { action: "nenhuma", reason: "Estratégia sem valor de compra" };

  if (cfg.entryType === "queda") {
    if (!(cfg.dropPct > 0)) return { action: "nenhuma", reason: "Estratégia sem % de queda" };
    let ref = cfg.referenceType === "manual" ? cfg.manualReference : m.high;
    if (s.entries > 0 && s.lastBuyUsd > 0) ref = ref ? Math.min(ref, s.lastBuyUsd) : s.lastBuyUsd;
    if (!ref || !(ref > 0)) return { action: "nenhuma", reason: "Sem preço de referência — aguardando histórico" };
    const at = ref * (1 - cfg.dropPct / 100);
    if (p <= at) return { action: "compra", reason: `Caiu ${fmt((1 - p / ref) * 100)} da referência (gatilho ${cfg.dropPct}%)` };
    return { action: "nenhuma", reason: `Esperando cair até US$ ${at.toPrecision(4)} (faltam ${fmt((p / at - 1) * 100)})` };
  }
  const c = m.closes;
  if (!(cfg.maSlow > cfg.maFast) || c.length < cfg.maSlow + 1) return { action: "nenhuma", reason: "Histórico insuficiente para as médias" };
  const fast = avg(c.slice(-cfg.maFast)), slow = avg(c.slice(-cfg.maSlow));
  const pf = avg(c.slice(-cfg.maFast - 1, -1)), ps = avg(c.slice(-cfg.maSlow - 1, -1));
  if (fast > slow && pf <= ps) return { action: "compra", reason: `Média de ${cfg.maFast} cruzou acima da de ${cfg.maSlow}` };
  return { action: "nenhuma", reason: fast > slow ? "Médias já cruzadas — esperando novo cruzamento" : "Esperando a média curta cruzar acima da longa" };
}

/** Applies a confirmed trade to the robot memory. */
export function afterTrade(s: BotState, d: Decision, t: { priceUsd: number; bnb: number; tokens: number; now: number }): BotState {
  const base = { ...s, tradesToday: s.tradesToday + 1, lastTradeAt: t.now };
  if (d.action === "compra") {
    const tokens = s.tokens + t.tokens;
    const avgPriceUsd = tokens > 0 ? (s.avgPriceUsd * s.tokens + t.priceUsd * t.tokens) / tokens : 0;
    return { ...base, entries: s.entries + 1, costBnb: s.costBnb + t.bnb, tokens, avgPriceUsd, lastBuyUsd: t.priceUsd, peakUsd: Math.max(s.peakUsd, t.priceUsd) };
  }
  if (d.action !== "venda") return s;
  const frac = s.tokens > 0 ? Math.min(1, t.tokens / s.tokens) : 1;
  const cost = s.costBnb * frac;
  const loss = Math.max(0, cost - t.bnb);
  const out = { ...base, lossTodayBnb: s.lossTodayBnb + loss };
  if (d.all || frac >= 0.999) return { ...out, entries: 0, costBnb: 0, tokens: 0, avgPriceUsd: 0, lastBuyUsd: 0, peakUsd: 0, tpDone: [] };
  return { ...out, costBnb: s.costBnb - cost, tokens: s.tokens - t.tokens, tpDone: d.tpIndex === undefined ? s.tpDone : [...s.tpDone, d.tpIndex] };
}
