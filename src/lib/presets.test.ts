import { describe, it, expect } from "vitest";
import { buildPreset } from "./presets";
import { EMPTY_CONFIG } from "./strategy";

describe("buildPreset", () => {
  it("segura: 1/4 do valor por compra, exposição 50%", () => {
    const c = buildPreset("segura", 1, null);
    expect(c.buyAmount).toBe(0.25);
    expect(c.maxExposureQuote).toBe(0.5);
    expect(c.stopLossPct).toBe(10);
  });
  it("equilibrada: 1/5 por compra, até 3 entradas", () => {
    const c = buildPreset("equilibrada", 1, 10000);
    expect(c.buyAmount).toBe(0.2);
    expect(c.maxEntries).toBe(3);
    expect(c.minLiquidityUsd).toBe(7000);
  });
  it("registra qual estilo foi escolhido, para a tela mostrar a seleção", () => {
    expect(buildPreset("ativa", 1, null).presetId).toBe("ativa");
    expect(buildPreset("segura", 1, null).presetId).toBe("segura");
    expect(EMPTY_CONFIG.presetId).toBeUndefined();
  });
});
