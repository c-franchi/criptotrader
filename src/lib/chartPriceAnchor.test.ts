import { expect, it } from "vitest";
import { buildChartPlanConfig } from "./chartPlan";
import { decide, EMPTY_STATE, afterTrade } from "./autoStrategy";
import { EMPTY_CONFIG } from "./strategy";
import { chartExecutionConfig, chartUsdPrices } from "./chartPriceAnchor";
import { chartRuleSchema } from "./chartRule";
const id = "11111111-1111-4111-8111-111111111111";
const config = () =>
  buildChartPlanConfig(
    {
      budgetBnb: "0.03",
      entryPrices: [68000 / 700, 62000 / 700],
      exitPrices: [72000 / 700],
      stopChoice: "price",
      stopBnb: 55000 / 700,
      priceAnchor: { unit: "USD", bnbUsd: 700 },
      partialEntriesAccepted: true,
      buyTaxPct: 0,
      sellTaxPct: 0,
      taxesConfirmed: true,
      acknowledge: true,
      gasBuyBnb: 0.00001,
      gasSellBnb: 0.00002,
      executionMarginPct: 1,
      maxGasGwei: 5,
      minLiquidityUsd: 0,
    },
    id,
    EMPTY_CONFIG,
  );
const observation = (usd: number, bnbUsd: number) => ({
  priceUsd: usd,
  priceBnb: usd / bnbUsd,
  liquidityUsd: 100000,
  high: null,
  closes: [],
  now: Date.now(),
});
it("keeps plotted entries, exits and stop fixed while both the asset and BNB fall", () => {
  const cfg = config();
  const before = structuredClone(cfg);
  for (const rate of [700, 650, 600, 500]) {
    const points = chartUsdPrices(cfg.chartRule!, rate)!;
    expect(points.entries!.map((e) => e.priceBnb)).toEqual([68000, 62000]);
    expect(points.exitBnb).toBe(72000);
    expect(points.stopBnb).toBe(55000);
  }
  expect(cfg).toEqual(before);
});
it("crosses the fixed target rather than chasing a constant token/BNB ratio", () => {
  const cfg = config();
  expect(decide(cfg, EMPTY_STATE, observation(70000, 700)).action).toBe("nenhuma");
  expect(decide(cfg, EMPTY_STATE, observation(68000, 600))).toMatchObject({
    action: "compra",
    chartEntryIndex: 0,
  });
  expect(decide(cfg, EMPTY_STATE, observation(64000, 550))).toMatchObject({
    action: "compra",
    chartEntryIndex: 0,
  });
  const legacy = { ...cfg, chartRule: { ...cfg.chartRule!, priceAnchor: undefined } };
  expect(decide(legacy, EMPTY_STATE, observation(64000, 550)).action).toBe("nenhuma");
});
it("retains per-entry progress, fixed sell/stop thresholds and no rebuy after finishing", () => {
  const cfg = config();
  const first = decide(cfg, EMPTY_STATE, observation(67000, 600));
  const held = afterTrade(EMPTY_STATE, first, {
    tokens: 1,
    bnb: 0.01,
    priceUsd: 67000,
    now: Date.now(),
  });
  expect(decide(cfg, held, observation(63000, 550)).action).toBe("nenhuma");
  expect(decide(cfg, held, observation(62000, 550))).toMatchObject({
    action: "compra",
    chartEntryIndex: 1,
  });
  expect(decide(cfg, held, observation(72000, 800))).toMatchObject({ action: "venda", all: true });
  expect(decide(cfg, held, observation(55000, 500))).toMatchObject({ action: "venda", all: true });
  expect(
    decide(
      cfg,
      { ...EMPTY_STATE, chartRuleConsumedId: id, chartFinished: true },
      observation(60000, 500),
    ).action,
  ).toBe("nenhuma");
});
it("changes only current native fee equivalents, preserving amounts, IDs, shares and saved rules", () => {
  const cfg = config();
  const before = structuredClone(cfg);
  const resolved = chartExecutionConfig(cfg, 550);
  expect(resolved.chartRule!.entries![0]!.priceBnb).toBeCloseTo(68000 / 550);
  expect(resolved.chartRule!.entries![0]!.amountBnb).toBe(cfg.chartRule!.entries![0]!.amountBnb);
  expect(resolved.chartRule!.id).toBe(id);
  expect(resolved.chartRule!.priceAnchor).toBeUndefined();
  expect(resolved.chartRule!.exits![0]!.sharePct).toBe(100);
  expect(cfg).toEqual(before);
  expect(() => chartExecutionConfig(cfg, 0)).toThrow();
});
it("rejects corrupt/nonfinite anchors and preserves explicitly legacy BNB rules", () => {
  const cfg = config();
  expect(
    chartRuleSchema.safeParse({ ...cfg.chartRule, priceAnchor: { unit: "USD", bnbUsd: Infinity } })
      .success,
  ).toBe(false);
  const legacy = { ...cfg, chartRule: { ...cfg.chartRule!, priceAnchor: undefined } };
  expect(chartExecutionConfig(legacy, 550)).toBe(legacy);
  expect(chartUsdPrices(legacy.chartRule!, 550)!.entryBnb).toBeCloseTo((68000 / 700) * 550);
});
