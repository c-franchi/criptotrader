/* eslint-disable @typescript-eslint/no-explicit-any -- isolated read-only quote and signing gateway doubles */
import { beforeEach, expect, it, vi } from "vitest";
import { parseEther } from "viem";
import { EMPTY_CONFIG } from "./strategy";
import { EMPTY_STATE } from "./autoStrategy";
import { buildChartPlanConfig } from "./chartPlan";
import { chartExecutionBasis } from "./chartExecution";
const io = vi.hoisted(() => ({ contract: vi.fn(), settle: vi.fn() }));
vi.mock("./submission.server", () => ({
  contractTransaction: io.contract,
  settleSubmission: io.settle,
}));
import { sendSwap } from "./bot.server";
const token = "0x1111111111111111111111111111111111111111",
  me = "0x2222222222222222222222222222222222222222";
const cfg = buildChartPlanConfig(
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
function setup(intent: Record<string, unknown> = {}): Parameters<typeof sendSwap>[0] {
  const read = vi
    .fn()
    .mockResolvedValueOnce([parseEther(".01"), parseEther("9.975")])
    .mockResolvedValueOnce([parseEther("9.975"), parseEther(".0099500625")]);
  const q: any = {
    select: () => q,
    eq: () => q,
    contains: () => q,
    not: async () => ({ data: [], error: null }),
  };
  return {
    pub: { readContract: read } as any,
    wallet: {} as any,
    me,
    token,
    side: "compra" as const,
    amountIn: parseEther(".01"),
    path: [me, token],
    slippagePct: 1,
    taxPct: 0,
    userId: "u",
    pair: "p",
    source: "robo",
    admin: { from: () => q },
    owner: "lock",
    intent,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.contract.mockResolvedValue({ hash: "0xtest", id: "submission" });
});
it("passes a whole-plan actual gas cap to the persistent submission path without requiring an isolated first-entry profit", async () => {
  const basis = chartExecutionBasis(cfg, EMPTY_STATE, 0, 0.001, 18);
  const o = setup({ chartPlanExecution: basis, sellTaxPct: 0 });
  await sendSwap(o);
  expect(io.contract).toHaveBeenCalledTimes(1);
  const intent = io.contract.mock.calls[0]![0].intent;
  expect(BigInt(intent.maxBuyFeeRaw)).toBe(parseEther(".00001"));
  expect(intent.chartPlanExecution).toEqual(basis);
  expect(intent.amountIn).toBe(parseEther(".01").toString());
});
it("keeps the isolated-trade guard for legacy rules", async () => {
  await expect(sendSwap(setup({ feeTargetGrossPct: 0.1, sellTaxPct: 0 }))).rejects.toThrow(
    "Custos de troca",
  );
  expect(io.contract).not.toHaveBeenCalled();
});
it("never submits a chart buy with a known unprofitable combined quote", async () => {
  const o = setup({
    chartPlanExecution: chartExecutionBasis(cfg, EMPTY_STATE, 0, 0.001, 18),
    sellTaxPct: 0,
  });
  (o.pub.readContract as any)
    .mockReset()
    .mockResolvedValueOnce([parseEther(".01"), parseEther("1")])
    .mockResolvedValueOnce([parseEther("1"), parseEther(".0009")]);
  await expect(sendSwap(o)).rejects.toThrow("margem estimada do conjunto");
  expect(io.contract).not.toHaveBeenCalled();
});
