import { describe, it, expect } from "vitest";
import { backtest, windowStats, type Candle } from "./backtest";
import { buildPreset } from "./presets";

describe("windowStats", () => {
  it("variação do período", () => {
    const s = windowStats([[0, 1, 1.2, 0.9, 1.1], [1, 1.1, 1.5, 1, 1.2]])!;
    expect(s.changePct).toBeCloseTo(20);
    expect(s.maxRisePct).toBeCloseTo(50);
    expect(s.maxDropPct).toBeCloseTo(-10);
  });
});

describe("backtest", () => {
  it("compra na queda de 8% e vende no take-profit", () => {
    const cfg = buildPreset("segura", 1, null); // 0.25 por compra, queda 8%, TP 10%/20%
    const c: Candle[] = [[0, 1, 1, 1, 1], [1, 1, 1, 0.9, 0.92], [2, 0.92, 1.2, 0.92, 1.15]];
    const r = backtest(c, cfg, 1)!;
    expect(r.trades).toBe(3);
    expect(r.pnl).toBeGreaterThan(0);
  });
  it("sem sinal não opera", () => {
    const r = backtest([[0, 1, 1, 1, 1], [1, 1, 1.05, 0.99, 1.02]], buildPreset("segura", 1, null), 1)!;
    expect(r.trades).toBe(0);
    expect(r.pnl).toBe(0);
  });
});
