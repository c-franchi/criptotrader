import { expect, it } from "vitest";
import {
  buildGuidedConfig,
  incompatibleBotToken,
  guidedInputSchema,
  knownFeeConsumesMargin,
} from "./guidedBot";
import { decide, EMPTY_STATE } from "./autoStrategy";
const input = {
  model: "dca" as const,
  capital: 0.01,
  buyAmount: 0.002,
  dropPct: 5,
  maxEntries: 3,
  cooldownMin: 0,
  maxTradesPerDay: 20,
  profitPct: 4,
  stopPct: 8,
  reserve: 0.0001,
  buyTax: 0,
  sellTax: 0,
  taxConfirmed: true as const,
  lower: 0,
  upper: 0,
  levels: 5,
  reboundPct: 1,
  maxReboundPct: 3,
  confirmationBars: 2,
};
it("maps staged purchases to an initial drop, additional drops and a full exit at average-price profit", () => {
  const c = buildGuidedConfig(input),
    m = { priceUsd: 94, high: 100, liquidityUsd: 100000, now: Date.now(), closes: [] };
  expect(decide(c, { ...EMPTY_STATE }, m).action).toBe("compra");
  const held = {
    ...EMPTY_STATE,
    entries: 1,
    tokens: 1,
    avgPriceUsd: 94,
    lastBuyUsd: 94,
    costBnb: 0.002,
  };
  expect(decide(c, held, { ...m, priceUsd: 90 }).action).toBe("nenhuma");
  expect(decide(c, held, { ...m, priceUsd: 89 }).action).toBe("compra");
  expect(decide(c, held, { ...m, priceUsd: 98 })).toMatchObject({ action: "venda", sellPct: 100 });
  expect(decide(c, held, { ...m, priceUsd: 85 })).toMatchObject({ action: "venda", all: true });
});
it("requires explicit tax confirmation, bounded capital, profit and stop", () => {
  for (const patch of [
    { taxConfirmed: false },
    { capital: 0.001 },
    { profitPct: 0 },
    { stopPct: 0 },
    { maxEntries: 20 },
  ])
    expect(guidedInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
});
it("keeps stop protection on taxed tokens and uses a separate net-of-token-tax target", () => {
  const c = buildGuidedConfig({ ...input, buyTax: 8, sellTax: 8 });
  expect(c.stopLossPct).toBe(8);
  expect(c.takeProfits[0]!.pct).toBeGreaterThan(4);
});
it("blocks the same asset independent of casing and rejects known fees exceeding the margin", () => {
  expect(incompatibleBotToken("0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c")).toBe(true);
  expect(incompatibleBotToken("0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c")).toBe(false);
  expect(knownFeeConsumesMargin(0.001, 1, 0.00002)).toBe(true);
  expect(knownFeeConsumesMargin(0.001, 1, null)).toBe(false);
});

import { guidedGridExit } from "./guidedBot";
it("gives a guided grid a real full-position stop and target without altering legacy grids", () => {
  const c = buildGuidedConfig({ ...input, model: "grid", lower: 0.01, upper: 0.02 });
  const state = { tokens: 1, avgPriceUsd: 0.015 };
  expect(guidedGridExit(c, state, 0.013)).toMatch(/Proteção/);
  expect(guidedGridExit(c, state, 0.016)).toMatch(/Meta/);
  expect(guidedGridExit(c, state, 0.015)).toBeNull();
  const legacy = { ...c };
  delete legacy.guidedModel;
  expect(guidedGridExit(legacy, state, 0.013)).toBeNull();
});

it("preserves explicit market/network protections and provides a grid correction field", () => {
  expect(buildGuidedConfig(input).minLiquidityUsd).toBe(5000);
  expect(buildGuidedConfig({ ...input, minLiquidityUsd: 12000, maxGasGwei: 3 })).toMatchObject({
    minLiquidityUsd: 12000,
    maxGasGwei: 3,
  });
  expect(guidedInputSchema.safeParse({ ...input, minLiquidityUsd: -1 }).success).toBe(false);
  const badGrid = guidedInputSchema.safeParse({ ...input, model: "grid", lower: 0, upper: 0 });
  expect(badGrid.success).toBe(false);
  if (!badGrid.success) expect(badGrid.error.issues[0]?.path).toEqual(["lower"]);
});

it("allows explicitly disabling the stop without disabling the profit target, for every guided model", () => {
  for (const model of ["dca", "grid", "recovery", "trend"] as const) {
    const c = buildGuidedConfig({
      ...input,
      model,
      lower: 0.01,
      upper: 0.02,
      stopPct: 0,
      allowNoStop: true,
      buyTax: 8,
      sellTax: 8,
    });
    expect(c.stopLossPct).toBe(0);
    expect(c.takeProfits[0]!.pct).toBeGreaterThan(4);
  }
});
it("without a stop, a deep drop alone does not force a sale, but profit exits still apply", () => {
  const c = buildGuidedConfig({ ...input, maxEntries: 1, stopPct: 0, allowNoStop: true });
  const held = {
    ...EMPTY_STATE,
    entries: 1,
    tokens: 1,
    avgPriceUsd: 100,
    lastBuyUsd: 100,
    costBnb: 0.002,
  };
  const m = { high: 100, liquidityUsd: 100000, now: Date.now(), closes: [] };
  expect(decide(c, held, { ...m, priceUsd: 30 }).action).toBe("nenhuma");
  expect(decide(c, held, { ...m, priceUsd: 105 }).action).toBe("venda");
  expect(guidedInputSchema.safeParse({ ...input, stopPct: 0, allowNoStop: false }).success).toBe(
    false,
  );
  expect(guidedInputSchema.safeParse({ ...input, stopPct: -1, allowNoStop: true }).success).toBe(
    false,
  );
});

it("maps the guided trend option to existing closed-candle trend rules and rejects inverted averages", () => {
  const c = buildGuidedConfig({ ...input, model: "trend", maFast: 2, maSlow: 4 });
  expect(c.entryType).toBe("medias");
  expect(c.candleInterval).toBe("15m");
  const m = {
    priceUsd: 1.15,
    high: 1.3,
    liquidityUsd: 100000,
    now: Date.now(),
    closes: [1, 1, 1.2, 1.2, 1.3],
  };
  expect(decide(c, { ...EMPTY_STATE }, m).action).toBe("compra");
  expect(decide(c, { ...EMPTY_STATE }, { ...m, priceUsd: 1.3 }).action).toBe("nenhuma");
  expect(
    guidedInputSchema.safeParse({ ...input, model: "trend", maFast: 9, maSlow: 5 }).success,
  ).toBe(false);
});
