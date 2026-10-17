import type { Candle } from "./backtest";
import type { StrategyConfig } from "./strategy";
import { decide, EMPTY_STATE, intervalMinutes, referenceHigh } from "./autoStrategy";
import { closedTail, sma } from "./candleSeries";
import { cycleSaleQuantity, immediateLossPct, liquidation, purchasedTokens, retained, type CostAssumptions } from "./costLedger";

/** Simulation-only; never imported by signing/execution code. Values are user-editable, not optimized. */
export type CandidatePolicy = { slopeBars: number; tolerancePct: number; spacingPct: number; recoveryBars: number; regimeBars: number; safetyPct: number; maxRebuys: 0 | 1; trailingMode: "preco" | "liquido" };
export const CANDIDATE_DEFAULTS: CandidatePolicy = { slopeBars: 3, tolerancePct: .5, spacingPct: 5, recoveryBars: 2, regimeBars: 3, safetyPct: 1, maxRebuys: 0, trailingMode: "liquido" };
export type SignalState = { armedAt: number | null; consumedAt: number; evaluatedAt: number };
export const EMPTY_SIGNAL: SignalState = { armedAt: null, consumedAt: 0, evaluatedAt: 0 };
export function recoverySignal(candles: Candle[], cfg: StrategyConfig, policy: CandidatePolicy, old: SignalState, now: number) {
  const bars = closedTail(candles, intervalMinutes(cfg.candleInterval), now);
  const last = bars.at(-1);
  const values = bars.map(c => c[4]);
  const fast = sma(values, cfg.maFast), slow = sma(values, cfg.maSlow), previousSlow = sma(values.slice(0, -policy.slopeBars), cfg.maSlow);
  const state = { ...old };
  if (!last || fast == null || slow == null || previousSlow == null) return { signal: false, state, reason: "Histórico insuficiente ou com lacunas", fast, slow, slope: null };
  if (now - (last[0] + intervalMinutes(cfg.candleInterval) * 60) * 1000 > intervalMinutes(cfg.candleInterval) * 60_000) return { signal: false, state, reason: "Dados desatualizados", fast, slow, slope: null };
  const slope = (slow / previousSlow - 1) * 100;
  if (last[0] <= state.evaluatedAt) return { signal: false, state, reason: "Aguardando fechamento de nova vela", fast, slow, slope };
  state.evaluatedAt = last[0];
  if (cfg.entryType === "medias" && !(fast > slow && slope > 0)) { state.armedAt = null; return { signal: false, state, reason: "Tendência não confirmada (SMA 21 sem inclinação positiva)", fast, slow, slope }; }
  if (cfg.entryType === "adaptativa" && confirmedRegime(values, cfg, policy) === "queda") { state.armedAt = null; return { signal: false, state, reason: "Regime de queda: sem entrada candidata", fast, slow, slope }; }
  const recovery = bars.slice(-policy.recoveryBars);
  const rising = recovery.length === policy.recoveryBars && recovery.every((c, i) => i === 0 || c[4] > (recovery[i - 1]?.[4] ?? Infinity));
  const isLateral = cfg.entryType === "adaptativa" && confirmedRegime(values, cfg, policy) === "lateral";
  const reclaimed = cfg.entryType === "queda" || isLateral ? rising : rising && last[4] > slow;
  if (state.armedAt != null && last[0] > state.armedAt && reclaimed) {
    state.armedAt = null; state.consumedAt = last[0];
    return { signal: true, state, reason: "Novo recuo e recuperação confirmados por velas fechadas", fast, slow, slope };
  }
  const range = values.slice(-Math.max(20, cfg.maSlow));
  const lateral = cfg.entryType === "adaptativa" && confirmedRegime(values, cfg, policy) === "lateral";
  const threshold = cfg.entryType === "queda" ? (cfg.referenceType === "manual" ? cfg.manualReference : referenceHigh(bars, now / 1000 - cfg.windowHours * 3600)) : lateral ? Math.min(...range) + (Math.max(...range) - Math.min(...range)) * .25 : slow * (1 + policy.tolerancePct / 100);
  const pullback = cfg.entryType === "queda" ? threshold != null && last[3] <= threshold * retained(cfg.dropPct) : last[3] <= (threshold ?? 0);
  if (pullback && state.armedAt == null && last[0] > state.consumedAt) state.armedAt = last[0];
  return { signal: false, state, reason: state.armedAt == null ? "Recuo ainda não ocorreu" : "Recuperação ainda não confirmada", fast, slow, slope };
}

export function confirmedRegime(values: number[], cfg: StrategyConfig, policy: CandidatePolicy): "alta" | "lateral" | "queda" | null {
  const classify = (v: number[]) => { const f = sma(v, cfg.maFast), s = sma(v, cfg.maSlow), p = sma(v.slice(0, -policy.slopeBars), cfg.maSlow); if (f == null || s == null || p == null) return null; if (f > s && s > p) return "alta"; if (f < s && s < p) return "queda"; return "lateral"; };
  const kinds = Array.from({ length: policy.regimeBars }, (_, i) => classify(i === 0 ? values : values.slice(0, -i)));
  return kinds[0] != null && kinds.every(k => k === kinds[0]) ? kinds[0] : null;
}
export function capturablePct(entry: number, exit: number) { return (exit / entry - 1) * 100; }
export type ReplayEvent = { at: number; action: string; reason: string; price: number; tokens: number; quote: number; signal?: unknown };
export type ReplayResult = { version: string; budget: number; spent: number; trades: number; pnlPct: number; liquidationValue: number; markValue: number; realized: number; gas: number; events: ReplayEvent[]; waiting: string; bars: number };

export function replayCandidate(input: Candle[], cfg: StrategyConfig, budget: number, costs: CostAssumptions, policy: CandidatePolicy, now: number, legacy = false): ReplayResult | null {
  if (!(budget > 0) || policy.slopeBars < 1 || policy.recoveryBars < 2 || policy.regimeBars < 1) return null;
  const minutes = intervalMinutes(cfg.candleInterval);
  const bars = closedTail(input, minutes, now);
  if (bars.length < cfg.maSlow + policy.slopeBars + policy.regimeBars) return null;
  let cash = budget, tokens = 0, cost = 0, baseTokens = 0, spent = 0, cycleSpent = 0, entries = 0, lastBuy = 0, lastTrade = 0, peak = 0, partial = false, realized = 0, gas = 0, marketAverage = 0, tradesToday = 0, lossToday = 0, day = "", waiting = "Aguardando sinal";
  let signal = { ...EMPTY_SIGNAL };
  const done = new Set<number>(), events: ReplayEvent[] = [];
  const maxBudget = Math.min(budget, cfg.maxExposureQuote > 0 ? cfg.maxExposureQuote : budget);
  // Same installment in all comparisons, frozen before the first fill; never sized from recovered balance.
  const installment = cfg.sizingMode === "fixo" ? cfg.buyAmount : budget * cfg.buyAmount / 100;
  const maxEntries = legacy ? cfg.maxEntries : Math.min(cfg.maxEntries, 1 + policy.maxRebuys);
  const sale = (bar: Candle, quantity: number, why: string, index?: number) => {
    const before = tokens;
    const proceeds = liquidation(quantity, bar[4], costs), assigned = cost * quantity / before;
    cash += proceeds; tokens -= quantity; cost -= assigned; realized += proceeds - assigned; lossToday += Math.max(0, assigned - proceeds); gas += costs.gasPerTrade + costs.approvalGas; tradesToday++; lastTrade = (bar[0] + minutes * 60) * 1000;
    events.push({ at: lastTrade, action: "venda", reason: why, price: bar[4], tokens: quantity, quote: proceeds });
    if (index != null) done.add(index);
    partial = tokens > 1e-12;
    if (!partial) { tokens = 0; cost = 0; baseTokens = 0; entries = 0; peak = 0; cycleSpent = 0; marketAverage = 0; done.clear(); }
  };
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]; if (!bar) continue;
    const at = (bar[0] + minutes * 60) * 1000;
    const today = new Date(at).toISOString().slice(0, 10);
    if (day !== today) { day = today; tradesToday = 0; lossToday = 0; }
    const history = input.filter(c => (c[0] + 300) * 1000 <= at), closes = bars.slice(0, i + 1).map(c => c[4]);
    // Closed-bar fills only: no using a future close to fill an earlier intrabar low/high.
    if (tokens > 0) {
      const value = liquidation(tokens, bar[4], costs), netPct = (value / cost - 1) * 100;
      peak = Math.max(peak, bar[4]);
      const pricePct = (bar[4] / marketAverage - 1) * 100;
      if (cfg.stopLossPct > 0 && (cfg.stopLossMode === "liquido" ? netPct <= -cfg.stopLossPct : pricePct <= -cfg.stopLossPct)) { sale(bar, tokens, `Stop: líquido (${value} / ${cost} - 1) × 100 = ${netPct}%; preço = ${pricePct}%`); continue; }
      const peakNet = (liquidation(tokens, peak, costs) / cost - 1) * 100;
      if (cfg.trailingEnabled && (policy.trailingMode === "liquido" ? peakNet : (peak / marketAverage - 1) * 100) >= cfg.trailingActivatePct && bar[4] <= peak * retained(cfg.trailingDistancePct)) { sale(bar, tokens, `Trailing ${policy.trailingMode}: pico ${peak}, líquido no pico ${peakNet}%`); continue; }
      const regime = confirmedRegime(closes, cfg, policy);
      if (cfg.entryType === "adaptativa" && regime) { const target = regime === "lateral" ? 1.5 : regime === "alta" ? 4 : 1; if (netPct >= target) { sale(bar, tokens, `Meta adaptativa ${regime}: ${target}% líquido`); continue; } }
      const hit = cfg.takeProfits.map((t, index) => ({ ...t, index })).find(t => !done.has(t.index) && pricePct >= t.pct);
      if (hit) { const final = cfg.takeProfits.every((_, index) => done.has(index) || index === hit.index); sale(bar, cycleSaleQuantity(baseTokens, tokens, hit.sellPct, final), `Alvo ${hit.index + 1}; base ${baseTokens}; disponível ${tokens}`, hit.index); continue; }
    }
    const r = recoverySignal(history, cfg, policy, signal, at); signal = r.state; waiting = r.reason;
    const isLegacy = legacy ? decide({ ...cfg, minLiquidityUsd: 0 }, { ...EMPTY_STATE, tokens, entries, avgPriceUsd: marketAverage, lastBuyUsd: lastBuy, costBnb: cost, lastTradeAt: lastTrade, tradesToday }, { priceUsd: bar[4], liquidityUsd: null, high: referenceHigh(history, at / 1000 - cfg.windowHours * 3600), closes, now: at }).action === "compra" : r.signal;
    if (!isLegacy) continue;
    if (partial) { waiting = "Venda parcial realizada: sem novas compras neste ciclo"; continue; }
    if (entries >= maxEntries || cycleSpent + installment > maxBudget + 1e-12) { waiting = "Limite de entradas ou orçamento inicial do ciclo atingido"; continue; }
    if (at - lastTrade < cfg.cooldownMin * 60_000) { waiting = `Cooldown: faltam ${Math.ceil((cfg.cooldownMin * 60_000 - at + lastTrade) / 60_000)} minutos`; continue; }
    if (entries > 0 && bar[4] > lastBuy * retained(policy.spacingPct)) { waiting = "Distância mínima desde a última compra não atingida"; continue; }
    if (cfg.maxTradesPerDay > 0 && tradesToday >= cfg.maxTradesPerDay || cfg.dailyLossLimit > 0 && lossToday >= cfg.dailyLossLimit) { waiting = "Limite diário: novas entradas pausadas, saídas continuam"; continue; }
    if (cash < installment + costs.gasPerTrade || installment <= 0) { waiting = "Orçamento insuficiente, separado da reserva de gás"; continue; }
    const loss = immediateLossPct(installment, bar[4], costs);
    if (!legacy && cfg.stopLossMode === "liquido" && cfg.stopLossPct > 0 && loss > cfg.stopLossPct) { waiting = `Custo incompatível com limite de perda: liquidação imediata ${loss.toFixed(2)}% > ${cfg.stopLossPct}%`; continue; }
    if (!legacy && cfg.entryType === "adaptativa") {
      const regime = confirmedRegime(closes, cfg, policy);
      if (!regime || regime === "queda") { waiting = "Regime sem confirmação ou de queda"; continue; }
      if (regime === "lateral") {
        const range = closes.slice(-Math.max(20, cfg.maSlow)), lo = Math.min(...range), hi = Math.max(...range), entry = lo + (hi - lo) * .25;
        const got = purchasedTokens(installment, bar[4], costs), potential = (liquidation(got, hi, costs) / (installment + costs.gasPerTrade) - 1) * 100;
        if (bar[4] > entry || potential < 1.5 + policy.safetyPct) { waiting = `Movimento capturável ${capturablePct(bar[4], hi).toFixed(2)}% não cobre custos + margem + lucro`; continue; }
      }
    }
    const got = purchasedTokens(installment, bar[4], costs), oldTokens = tokens;
    cash -= installment + costs.gasPerTrade; cost += installment + costs.gasPerTrade; tokens += got; baseTokens += got; spent += installment; cycleSpent += installment; gas += costs.gasPerTrade; entries++; tradesToday++; lastTrade = at; lastBuy = bar[4]; peak = Math.max(peak, bar[4]); marketAverage = (marketAverage * oldTokens + bar[4] * got) / tokens;
    events.push({ at, action: "compra", reason: legacy ? "Regra anterior de entrada, replay normalizado" : r.reason, price: bar[4], tokens: got, quote: installment, signal: { ...r, lossPct: loss, cycleBudget: maxBudget, installment, policy } });
  }
  const last = bars.at(-1); if (!last) return null;
  const liquidationValue = cash + (tokens ? liquidation(tokens, last[4], costs) : 0);
  return { version: legacy ? "Entrada v1 / replay normalizado" : "Candidata v2 · apenas simulação", budget: maxBudget, spent, trades: events.length, pnlPct: (liquidationValue / budget - 1) * 100, liquidationValue, markValue: cash + tokens * last[4], realized, gas, events, waiting, bars: bars.length };
}