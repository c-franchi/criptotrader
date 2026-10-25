/* eslint-disable @typescript-eslint/no-explicit-any -- isolated execution gateway doubles; no transactions */
import { beforeEach, expect, it, vi } from "vitest";
import { parseEther } from "viem";
import { buildChartPlanConfig } from "./chartPlan";
import { EMPTY_CONFIG } from "./strategy";
import { EMPTY_STATE } from "./autoStrategy";
const io = vi.hoisted(() => ({ send: vi.fn() }));
const token = "0x1111111111111111111111111111111111111111",
  pair = "0x2222222222222222222222222222222222222222";
vi.mock("./market.server", () => ({
  readMarket: async () => ({
    fetchedAt: new Date().toISOString(),
    error: null,
    pools: [
      {
        supported: true,
        pairAddress: "0x2222222222222222222222222222222222222222",
        priceUsd: "100",
        liquidityUsd: 100000,
      },
    ],
  }),
}));
vi.mock("./history.server", () => ({ readCandles: vi.fn() }));
vi.mock("./tokenMeta.server", () => ({ tokenMeta: async () => ({ decimals: 18 }) }));
vi.mock("./walletCapital.server", () => ({
  readWalletCapital: async () => ({
    rows: [{ id: "bot", available: "0.02", reserved: "0.02" }],
    reserved: "0.02",
  }),
}));
vi.mock("./bot.server", () => ({
  poolState: async () => ({
    pair: "0x2222222222222222222222222222222222222222",
    price: 0.001,
    bnb: 100000000000000000000n,
  }),
  pubClient: () => ({ getBalance: async () => 100000000000000000n }),
  botSigner: async () => ({
    account: { address: "0x3333333333333333333333333333333333333333" },
    wallet: {},
  }),
  sendSwap: io.send,
  approveForSwap: vi.fn(),
}));
import { runStrategyStep } from "./strategyBot.server";
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
function admin(config: unknown) {
  const q: any = {
    insert: async () => ({ error: null }),
    select: () => q,
    eq: () => q,
    ilike: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: { config } }),
  };
  return { from: () => q };
}
const bot = { id: "bot", user_id: "u", wallet_scope: "s", token, strat_state: EMPTY_STATE };
beforeEach(() => {
  vi.clearAllMocks();
  io.send.mockResolvedValue({ order: { status: "enviada", tx_hash: null }, net: 1n });
});
it("routes accepted partial-fill risk through the whole-plan quote/gas guard with the exact planned amount and decision", async () => {
  await runStrategyStep(admin(cfg), bot, "", "lock");
  expect(io.send).toHaveBeenCalledTimes(1);
  const o = io.send.mock.calls[0]![0];
  expect(o.amountIn).toBe(parseEther(".01"));
  expect(o.intent.chartPlanExecution).toMatchObject({
    version: 1,
    decimals: 18,
    futureCostBnb: "0.01003",
  });
  expect(o.intent.decision).toMatchObject({ chartEntryIndex: 0, chartRuleId: cfg.chartRule!.id });
  expect(o.intent.feeTargetGrossPct).toBeUndefined();
  expect(o.maxGasGwei).toBe(5);
  expect(o.slippagePct).toBe(1);
  expect(o.pair).toBe(pair);
});
it("retains the isolated profitability cap when incomplete-entry loss was not accepted", async () => {
  await runStrategyStep(
    admin({ ...cfg, chartRule: { ...cfg.chartRule, partialEntriesAccepted: false } }),
    bot,
    "",
    "lock",
  );
  expect(io.send.mock.calls[0]![0].intent.chartPlanExecution).toBeTruthy();
  expect(io.send.mock.calls[0]![0].intent.feeTargetGrossPct).toBeCloseTo(0.1);
});
it("does not migrate legacy saved plans into the new execution model", async () => {
  await runStrategyStep(
    admin({ ...cfg, chartRule: { ...cfg.chartRule, projectionVersion: undefined } }),
    bot,
    "",
    "lock",
  );
  expect(io.send.mock.calls[0]![0].intent.chartPlanExecution).toBeUndefined();
  expect(io.send.mock.calls[0]![0].intent.feeTargetGrossPct).toBeCloseTo(0.1);
});
