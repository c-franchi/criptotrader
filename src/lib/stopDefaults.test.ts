import { describe, expect, it } from "vitest";
import { buildPreset } from "./presets";
import { stopRealLossPct } from "./stopLoss";

describe("stop padrão por taxa", () => {
  it("token com taxa 8/8 começa sem stop", () => {
    expect(buildPreset("segura", 1, null, { buy: 8, sell: 8 }).stopLossPct).toBe(0);
  });
  it("token sem taxa mantém stop do preset", () => {
    expect(buildPreset("segura", 1, null, { buy: 0, sell: 0 }).stopLossPct).toBe(10);
  });
  it("stop de 8% por preço com taxas 8/8 perde ~22,1%", () => {
    expect(stopRealLossPct({ stopLossPct: 8, stopLossMode: "preco", buyTaxPct: 8, sellTaxPct: 8 })).toBeCloseTo(22.13, 1);
  });
  it("stop desativado não calcula perda", () => {
    expect(stopRealLossPct({ stopLossPct: 0, buyTaxPct: 8, sellTaxPct: 8 })).toBeNull();
  });
});
