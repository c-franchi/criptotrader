import { describe, expect, it } from "vitest";
import { afterTrade, decide, EMPTY_STATE, readRegime } from "./autoStrategy";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";
import { strategySchema } from "./strategyValidation";
import { strategyObservation } from "./strategyObservation";
import type { Candle } from "./backtest";
const now = 1_800_000_000_000;
const cfg: StrategyConfig = {
  ...EMPTY_CONFIG,
  buyAmount: 0.001,
  entryType: "adaptativa",
  candleInterval: "5m",
  cooldownMin: 0,
  buyTaxPct: 8,
  sellTaxPct: 8,
  maxSlippagePct: 2,
  recovery: {
    enabled: true,
    minDropPct: 8,
    reboundPct: 2,
    maxReboundPct: 8,
    confirmationBars: 2,
    minNetPct: 1.5,
  },
};
const values = [...Array<number>(22).fill(100), 85, 74, 75, 76];
const candles = (v = values): Candle[] =>
  v.map((p, i) => [now / 1000 - (v.length - i) * 300, p, p, p, p, 1]);
const market = () => strategyObservation(cfg, candles(), 76, 100000, now);
describe("real recovery entry", () => {
  it("buys a confirmed recovery after a 26% drop even when fast SMA remains below slow SMA", () => {
    expect(decide(cfg, EMPTY_STATE, market())).toMatchObject({
      action: "compra",
      recoveryLowAt: expect.any(Number),
    });
  });
  it("does not catch a falling price or just one rising close", () => {
    for (const v of [
      [...values.slice(0, -2), 73, 72],
      [...values.slice(0, -2), 73, 75],
    ])
      expect(
        decide(cfg, EMPTY_STATE, strategyObservation(cfg, candles(v), v.at(-1)!, 100000, now))
          .action,
      ).toBe("nenhuma");
  });
  it("blocks stale candles, gaps, late chasing and a live reversal below the closed price", () => {
    const stale = candles().map((c) => [c[0] - 3600, ...c.slice(1)] as Candle);
    const hole = candles().filter((_, i) => i !== 20);
    for (const c of [stale, hole])
      expect(decide(cfg, EMPTY_STATE, strategyObservation(cfg, c, 76, 100000, now)).action).toBe(
        "nenhuma",
      );
    expect(decide(cfg, EMPTY_STATE, { ...market(), priceUsd: 85 }).action).toBe("nenhuma");
    expect(decide(cfg, EMPTY_STATE, { ...market(), priceUsd: 75.5 }).action).toBe("nenhuma");
  });
  it("rejects recoveries whose headroom cannot cover token taxes and execution allowance", () => {
    const v = [...Array<number>(22).fill(85), 80, 74, 75, 76];
    expect(
      decide(cfg, EMPTY_STATE, strategyObservation(cfg, candles(v), 76, 100000, now)).reason,
    ).toMatch(/margem estimada/);
  });
  it("consumes the trough only after a confirmed fill and never buys the same trough twice", () => {
    const d = decide(cfg, EMPTY_STATE, market());
    const filled = afterTrade(EMPTY_STATE, d, { priceUsd: 76, bnb: 0.001, tokens: 100, now });
    const exited = afterTrade(
      filled,
      { action: "venda", all: true, sellPct: 100, reason: "test" },
      { priceUsd: 100, bnb: 0.002, tokens: 100, now },
    );
    expect(decide(cfg, exited, market()).reason).toMatch(/já utilizada/);
    expect(EMPTY_STATE.recoveryLowAt).toBeUndefined();
  });
  it("preserves stops, entry limits and old saved strategies", () => {
    expect(
      decide(
        { ...cfg, stopLossPct: 6 },
        { ...EMPTY_STATE, tokens: 100, avgPriceUsd: 100 },
        market(),
      ).action,
    ).toBe("venda");
    expect(decide(cfg, { ...EMPTY_STATE, tradesToday: 100 }, market()).action).toBe("nenhuma");
    const { recovery: _, ...old } = cfg;
    expect(decide(old, EMPTY_STATE, market()).action).toBe("nenhuma");
    expect(decide(cfg, { ...EMPTY_STATE, tokens: 100, avgPriceUsd: 76 }, market()).action).toBe(
      "nenhuma",
    );
  });
  it("recognizes a wide lateral range in the new mode while preserving old classification", () => {
    const v = Array.from({ length: 22 }, (_, i) => (i % 2 ? 125 : 100));
    expect(readRegime(cfg, v)?.kind).toBe("lateral");
    expect(
      readRegime({ ...cfg, recovery: { ...cfg.recovery!, enabled: false } }, v)?.kind,
    ).not.toBe("lateral");
  });
  it("rejects invalid recovery settings", () => {
    expect(
      strategySchema.safeParse({ ...cfg, recovery: { ...cfg.recovery!, confirmationBars: 1 } })
        .success,
    ).toBe(false);
    expect(
      strategySchema.safeParse({ ...cfg, recovery: { ...cfg.recovery!, maxReboundPct: 1 } })
        .success,
    ).toBe(false);
    expect(strategySchema.safeParse({ ...cfg, entryType: "queda" }).success).toBe(false);
  });
});
