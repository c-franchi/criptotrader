import { describe, expect, it } from "vitest";
import { stopPrice, netPositionPct } from "./stopLoss";
import { EMPTY_CONFIG } from "./strategy";
import { afterTrade, decide, normalizeState } from "./autoStrategy";
import { monitorState } from "./monitor";

const cfg = { ...EMPTY_CONFIG, stopLossMode: "liquido" as const, stopLossPct: 20, buyTaxPct: 8, sellTaxPct: 8 };
const now = Date.UTC(2026, 9, 16);
const holding = { ...normalizeState({}, now), tokens: 92, avgPriceUsd: 1, costBnb: 1, entries: 1 };
const market = (priceUsd: number) => ({ priceUsd, liquidityUsd: 10000, high: 1, closes: [], now });

describe("stop por perda líquida", () => {
  it("includes both 8% token taxes, even with an unchanged price", () => {
    expect(netPositionPct(1, 1, cfg)).toBeCloseTo(-15.36, 8);
  });
  it("sells at a 20% net loss, not at a 20% price drop", () => {
    expect(stopPrice(1, cfg)).toBeCloseTo(0.9451795841, 8);
    expect(decide(cfg, holding, market(0.95)).action).toBe("nenhuma");
    expect(decide(cfg, holding, market(0.9451795841))).toMatchObject({ action: "venda", all: true });
  });
  it("keeps old configurations price-based", () => {
    expect(stopPrice(1, { ...cfg, stopLossMode: "preco" })).toBeCloseTo(0.8);
    const { stopLossMode: _mode, ...old } = cfg;
    expect(stopPrice(1, old)).toBeCloseTo(0.8);
  });
  it("recalculates protection after sequential purchases", () => {
    const next = afterTrade(holding, { action: "compra", reason: "" }, { priceUsd: 0.8, tokens: 115, bnb: 1, now });
    expect(next.avgPriceUsd).toBeCloseTo(0.8888888889);
    expect(stopPrice(next.avgPriceUsd, cfg)).toBeCloseTo(0.8401596303);
  });
  it("monitoring uses the same tax-inclusive trigger", () => {
    const monitored = monitorState({ ...cfg, referenceType: "manual", manualReference: 1 }, 0.94, null);
    expect(monitored.alerts.find((a) => a.kind === "stop")).toMatchObject({ active: true, triggerAt: stopPrice(1, cfg) });
  });
  it("zero disables this stop", () => {
    expect(stopPrice(1, { ...cfg, stopLossPct: 0 })).toBeNull();
    expect(decide({ ...cfg, stopLossPct: 0 }, holding, market(0.5)).action).toBe("nenhuma");
  });
});