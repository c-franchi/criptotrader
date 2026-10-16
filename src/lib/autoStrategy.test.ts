import { describe, expect, it } from "vitest";
import { afterTrade, decide, EMPTY_STATE, normalizeState } from "./autoStrategy";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";

const now = Date.UTC(2026, 9, 16, 12);
const cfg: StrategyConfig = { ...EMPTY_CONFIG, buyAmount: 0.01, sizingMode: "fixo", entryType: "queda", dropPct: 8, maxEntries: 2, cooldownMin: 0, maxTradesPerDay: 5, takeProfits: [{ pct: 10, sellPct: 50 }, { pct: 20, sellPct: 100 }], stopLossPct: 10 };
const m = (priceUsd: number, high = 1) => ({ priceUsd, liquidityUsd: 1e6, high, closes: [], now });
const st = normalizeState({}, now);

describe("decide (robô segue a estratégia)", () => {
  it("buys only after the configured drop from the 24h high", () => {
    expect(decide(cfg, st, m(0.93)).action).toBe("nenhuma");
    expect(decide(cfg, st, m(0.92)).action).toBe("compra");
  });
  it("sells half at +10% and everything at stop-loss -10%", () => {
    const held = afterTrade(st, { action: "compra", reason: "" }, { priceUsd: 1, bnb: 0.01, tokens: 100, now });
    const tp = decide(cfg, held, m(1.1, 2));
    expect(tp).toMatchObject({ action: "venda", sellPct: 50, tpIndex: 0 });
    expect(decide(cfg, held, m(0.9, 2))).toMatchObject({ action: "venda", sellPct: 100 });
  });
  it("respects the daily trade limit", () => {
    expect(decide({ ...cfg, maxTradesPerDay: 1 }, { ...st, tradesToday: 1 }, m(0.5)).action).toBe("nenhuma");
  });
  it("resets daily counters on a new day", () => {
    expect(normalizeState({ ...EMPTY_STATE, day: "2026-10-15", tradesToday: 4 }, now).tradesToday).toBe(0);
  });
});

import { referenceHigh } from "./autoStrategy";
describe("compra sempre na baixa", () => {
  it("ignores a one-candle spike when finding the 24h top", () => {
    const c = [[1, 1, 1, 1, 1], [2, 1, 9, 1, 3], [3, 1, 1, 1, 1], [4, 1, 1.1, 1, 1.1]] as [number, number, number, number, number][];
    expect(referenceHigh(c, 0)).toBe(1.1);
  });
  it("trend strategy buys only when the price dips to the long average, never above it", () => {
    const t = { ...cfg, entryType: "medias" as const, maFast: 2, maSlow: 4 };
    const closes = [1, 1, 1.2, 1.2, 1.3]; // uptrend: fast 1.25 > slow 1.175
    expect(decide(t, st, { ...m(1.3), closes }).action).toBe("nenhuma");
    expect(decide(t, st, { ...m(1.15), closes }).action).toBe("compra");
    expect(decide(t, st, { ...m(0.9), closes: [1.3, 1.2, 1, 0.9, 0.8] }).action).toBe("nenhuma"); // downtrend
  });
});
