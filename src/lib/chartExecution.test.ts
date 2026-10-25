import { expect, it } from "vitest";
import { parseEther } from "viem";
import Decimal from "decimal.js";
import { chartExecutionBasis, chartMaxBuyFeeRaw } from "./chartExecution";
import { buildChartPlanConfig } from "./chartPlan";
import { EMPTY_CONFIG } from "./strategy";
import { EMPTY_STATE } from "./autoStrategy";
export const chartExecutionConfig = buildChartPlanConfig(
  {
    partialEntriesAccepted: true,
    budgetBnb: "0.02004",
    entryPrices: [0.001, 0.00095],
    exitPrices: [0.001001],
    stopChoice: "none",
    stopBnb: null,
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
  "11111111-1111-4111-8111-111111111111",
  EMPTY_CONFIG,
);
it("permits an acknowledged combined-plan purchase whose isolated first entry would lose, but still limits actual gas", () => {
  const b = chartExecutionBasis(chartExecutionConfig, EMPTY_STATE, 0, 0.001, 18, "0.001")!;
  const fee = chartMaxBuyFeeRaw(
    b,
    parseEther(".01"),
    parseEther("9.975"),
    parseEther(".0099500625"),
  );
  expect(BigInt(fee)).toBeGreaterThan(parseEther(".00001"));
  expect(new Decimal(".0099500625").mul(1.001).lt(0.01)).toBe(true);
  const expected = new Decimal(b.futureTokens)
    .plus(9.975)
    .mul(b.targetPriceBnb)
    .mul(0.9975)
    .minus(b.futureCostBnb)
    .minus(0.01);
  expect(BigInt(fee)).toBe(parseEther(expected.toFixed(18, Decimal.ROUND_DOWN)));
});
it("uses confirmed held tokens and costs without applying buy tax or gas twice", () => {
  const state = {
    ...EMPTY_STATE,
    tokens: 9.975,
    tokensRaw: parseEther("9.975").toString(),
    costBnb: 0.01001,
    chartRuleConsumedId: chartExecutionConfig.chartRule!.id,
    chartEntriesDone: [0],
  };
  const b = chartExecutionBasis(chartExecutionConfig, state, 1, 0.00095, 18)!;
  expect(b.futureTokens).toBe("9.975");
  expect(b.futureCostBnb).toBe("0.01003");
  expect(() => chartExecutionBasis(chartExecutionConfig, state, 0, 0.001, 18)).toThrow(
    "não permite",
  );
  expect(() =>
    chartExecutionBasis(chartExecutionConfig, { ...state, chartExiting: true }, 1, 0.001, 18),
  ).toThrow("não permite");
});
it("fails closed when the current quote consumes the combined budget or returns no tokens", () => {
  const b = chartExecutionBasis(chartExecutionConfig, EMPTY_STATE, 0, 0.001, 18)!;
  expect(() =>
    chartMaxBuyFeeRaw(b, parseEther(".01"), parseEther("1"), parseEther(".0009")),
  ).toThrow("margem estimada do conjunto");
  expect(() => chartMaxBuyFeeRaw(b, parseEther(".01"), 0n, 1n)).toThrow("indisponível");
  expect(
    chartExecutionBasis(
      {
        ...chartExecutionConfig,
        chartRule: { ...chartExecutionConfig.chartRule!, projectionVersion: undefined },
      },
      EMPTY_STATE,
      0,
      0.001,
      18,
    ),
  ).toBeNull();
});

it("never pays actual gas from another bot's reservations or its own remaining purchase capital", () => {
  const b = chartExecutionBasis(chartExecutionConfig, EMPTY_STATE, 0, 0.001, 18)!;
  expect(
    chartMaxBuyFeeRaw(b, parseEther(".01"), parseEther("9.975"), parseEther(".0099500625")),
  ).toBe(parseEther(".00001").toString());
});
