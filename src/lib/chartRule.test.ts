import { expect, it } from "vitest";
import {
  chartProjection,
  heldChartProjection,
  buildChartConfig,
  chartRuleInputSchema,
  type ChartRuleInput,
} from "./chartRule";
import { strategySchema } from "./strategyValidation";
import { afterTrade, decide, EMPTY_STATE, normalizeState, updateEntryLatch } from "./autoStrategy";

export const chartInput: ChartRuleInput = {
  entryBnb: 0.001,
  exitBnb: 0.0013,
  stopBnb: null,
  stopChoice: "none",
  amountBnb: 0.01,
  buyTaxPct: 5,
  sellTaxPct: 5,
  taxesConfirmed: true,
  dexFeePct: 0.25,
  executionMarginPct: 1,
  gasBuyBnb: 0.00001,
  gasSellBnb: 0.00002,
  costsConfirmed: true,
  reserveBnb: 0.0001,
  maxGasGwei: 5,
  minLiquidityUsd: 5000,
  acknowledge: true,
};
const id = "11111111-1111-4111-8111-111111111111";
const config = buildChartConfig(chartInput, id);
const market = {
  priceUsd: 100,
  priceBnb: 0.001,
  liquidityUsd: 100000,
  high: 9999,
  closes: [],
  historyFresh: false,
  now: 1000000,
};
it("solves the exact tax-only break-even and desired net return rather than adding taxes", () => {
  const c = {
    ...chartInput,
    entryBnb: 1,
    amountBnb: 1,
    dexFeePct: 0,
    executionMarginPct: 0,
    gasBuyBnb: 0,
    gasSellBnb: 0,
  };
  const p = chartProjection(c, 1, 3)!;
  expect((p.breakEvenBnb - 1) * 100).toBeCloseTo(10.803324, 5);
  expect(p.targetBnb).toBeCloseTo(1.03 / (0.95 * 0.95), 12);
  expect(chartProjection(c, p.targetBnb)!.netPct).toBeCloseTo(3, 10);
});
it("applies DEX fees, margin and each gas cost once and uses actual held tokens without taxing a buy twice", () => {
  const p = chartProjection(chartInput, chartInput.exitBnb, 4)!;
  expect(chartProjection(chartInput, p.breakEvenBnb)!.profitBnb).toBeCloseTo(0, 12);
  expect(chartProjection(chartInput, p.targetBnb)!.netPct).toBeCloseTo(4, 10);
  expect(
    heldChartProjection(p.quantity, p.invested, chartInput.exitBnb, 5, 0.25, 1, 0.00002)!.profitBnb,
  ).toBeCloseTo(p.profitBnb, 12);
  expect(chartProjection({ ...chartInput, gasSellBnb: NaN }, 1)).toBeNull();
  expect(chartProjection({ ...chartInput, buyTaxPct: 100 }, 1)).toBeNull();
});
it("requires explicit taxes, costs, stop choice and risk review, with valid future levels", () => {
  expect(chartRuleInputSchema.safeParse({ ...chartInput, stopChoice: undefined }).success).toBe(
    false,
  );
  expect(chartRuleInputSchema.safeParse({ ...chartInput, taxesConfirmed: false }).success).toBe(
    false,
  );
  expect(
    chartRuleInputSchema.safeParse({ ...chartInput, stopChoice: "price", stopBnb: 0.0011 }).success,
  ).toBe(false);
  expect(chartRuleInputSchema.safeParse({ ...chartInput, exitBnb: 0.0009 }).success).toBe(false);
  expect(strategySchema.safeParse(config).success).toBe(true);
});
it("uses fresh native price levels, never historical candle highs or USD prices as BNB", () => {
  expect(decide(config, EMPTY_STATE, { ...market, priceBnb: 0.0011 }).action).toBe("nenhuma");
  expect(decide(config, EMPTY_STATE, market)).toMatchObject({ action: "compra", chartRuleId: id });
  expect(decide(config, EMPTY_STATE, { ...market, priceBnb: NaN }).action).toBe("nenhuma");
  expect(decide(config, EMPTY_STATE, { ...market, priceUsd: 0 }).action).toBe("nenhuma");
  expect(decide(config, EMPTY_STATE, { ...market, liquidityUsd: 1 }).action).toBe("nenhuma");
});
it("sells at fixed BNB targets, keeps the optional stop off and gives exits priority over buy limits", () => {
  const holding = {
    ...EMPTY_STATE,
    tokens: 10,
    costBnb: 0.01,
    avgPriceUsd: 100,
    tradesToday: 999,
    lastTradeAt: market.now,
  };
  expect(decide(config, holding, { ...market, priceUsd: 100000, priceBnb: 0.0012 }).action).toBe(
    "nenhuma",
  );
  expect(decide(config, holding, { ...market, priceBnb: 0.00001 }).action).toBe("nenhuma");
  expect(decide(config, holding, { ...market, priceBnb: 0.0013 })).toMatchObject({
    action: "venda",
    all: true,
  });
  const stopped = buildChartConfig({ ...chartInput, stopChoice: "price", stopBnb: 0.0008 }, id);
  expect(decide(stopped, holding, { ...market, priceBnb: 0.0007 })).toMatchObject({
    action: "venda",
    all: true,
  });
});
it("consumes a rule only on confirmed fill and never rearms after full sale or a new UTC day", () => {
  const decision = decide(config, EMPTY_STATE, market);
  const bought = afterTrade(EMPTY_STATE, decision, {
    priceUsd: 100,
    bnb: 0.01,
    tokens: 10,
    now: market.now,
  });
  expect(bought.chartRuleConsumedId).toBe(id);
  const sold = afterTrade(
    bought,
    { action: "venda", reason: "saída", sellPct: 100, all: true },
    { priceUsd: 130, bnb: 0.012, tokens: 10, now: market.now + 10000 },
  );
  const tomorrow = normalizeState(sold, market.now + 86400000);
  expect(updateEntryLatch(config, tomorrow, market).chartRuleConsumedId).toBe(id);
  expect(decide(config, tomorrow, market)).toMatchObject({
    action: "nenhuma",
    reason: expect.stringContaining("já utilizada"),
  });
  const newConfig = buildChartConfig(chartInput, "22222222-2222-4222-8222-222222222222");
  expect(decide(newConfig, tomorrow, market).action).toBe("compra");
});
