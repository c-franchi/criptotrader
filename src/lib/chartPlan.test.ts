import { expect, it } from "vitest";
import { parseEther } from "viem";
import {
  buildChartPlanConfig,
  chartPlanInputSchema,
  dividePlanBudget,
  planGasReserve,
  planProjection,
  splitExitShares,
  suggestPlanExits,
  type ChartPlanInput,
} from "./chartPlan";
import { EMPTY_CONFIG } from "./strategy";
import { EMPTY_STATE, afterTrade, decide, normalizeState } from "./autoStrategy";
import { strategySchema } from "./strategyValidation";
import { walletCapital, type CapitalBot } from "./walletCapital";
const id = "11111111-1111-4111-8111-111111111111";
const input: ChartPlanInput = {
  budgetBnb: "0.03",
  entryPrices: [0.001, 0.0008, 0.0006],
  exitPrices: [0.0013, 0.0015, 0.0017],
  stopChoice: "none",
  stopBnb: null,
  buyTaxPct: 5,
  sellTaxPct: 5,
  taxesConfirmed: true,
  acknowledge: true,
  gasBuyBnb: 0.00001,
  gasSellBnb: 0.00002,
  executionMarginPct: 1,
  maxGasGwei: 5,
  minLiquidityUsd: 1000,
};
const cfg = buildChartPlanConfig(input, id, EMPTY_CONFIG);
const market = {
  priceUsd: 100,
  priceBnb: 0.001,
  liquidityUsd: 100000,
  closes: [],
  high: 100,
  historyFresh: false,
  now: 1000000,
};
const fill = (state = EMPTY_STATE, price = 0.001) =>
  afterTrade(state, decide(cfg, state, { ...market, priceBnb: price }), {
    priceUsd: price * 100000,
    bnb: 0.01,
    tokens: 10,
    now: market.now,
  });
it("splits the exact budget in wei after reserving every buy and exit, without losing remainder", () => {
  const a = dividePlanBudget("0.030000000000000001", 3, 3, 0.00001, 0.00002)!;
  expect(a.amounts.reduce((s, v) => s + parseEther(v), 0n) + parseEther(a.gasBnb)).toBe(
    parseEther(a.budgetBnb),
  );
  expect(parseEther(a.amounts[2]!) - parseEther(a.amounts[0]!)).toBeLessThan(3n);
  expect(dividePlanBudget("0.00001", 3, 2, 0.00001, 0.00002)).toBeNull();
  expect(dividePlanBudget("1", 0, 1, 0, 0)).toBeNull();
  expect(splitExitShares(3)).toEqual([33.33, 33.33, 33.34]);
  expect(strategySchema.safeParse(cfg).success).toBe(true);
});
it("validates every point, explicit stop choice and exit ordering", () => {
  for (const invalid of [
    { stopChoice: undefined },
    { entryPrices: [0.001, 0.001] },
    { exitPrices: [0.0009] },
    { stopChoice: "price", stopBnb: 0.0007 },
    { acknowledge: false },
  ])
    expect(chartPlanInputSchema.safeParse({ ...input, ...invalid }).success).toBe(false);
});
it("consumes entries only on receipt, keeps all entries after restart and uses native live price", () => {
  expect(decide(cfg, EMPTY_STATE, market)).toMatchObject({ action: "compra", chartEntryIndex: 0 });
  const one = fill();
  expect(one.chartEntriesDone).toEqual([0]);
  expect(decide(cfg, one, market).action).toBe("nenhuma");
  const two = fill(normalizeState(JSON.parse(JSON.stringify(one)), market.now), 0.0008);
  expect(two.chartEntriesDone).toEqual([0, 1]);
  const three = fill(two, 0.0005);
  expect(three.chartEntriesDone).toEqual([0, 1, 2]);
  expect(decide(cfg, three, { ...market, priceBnb: 0.0005 }).action).toBe("nenhuma");
  expect(decide(cfg, EMPTY_STATE, { ...market, priceBnb: NaN }).action).toBe("nenhuma");
});
it("sells percentages of the original position, cancels pending entries and never reenters after a full exit", () => {
  const one = fill();
  const d = decide(cfg, one, { ...market, priceBnb: 0.0013 });
  expect(d).toMatchObject({ action: "venda", all: false, sellPct: 33.33, chartExitIndices: [0] });
  const partial = afterTrade(one, d, {
    priceUsd: 130,
    bnb: 0.005,
    tokens: 3.333,
    now: market.now + 1,
  });
  expect(partial.chartExiting).toBe(true);
  expect(decide(cfg, partial, { ...market, priceBnb: 0.0005 }).action).toBe("nenhuma");
  const next = decide(cfg, partial, { ...market, priceBnb: 0.0015 });
  expect(next.action === "venda" && next.sellPct).toBeCloseTo((33.33 / 66.67) * 100);
  const last = decide(cfg, partial, { ...market, priceBnb: 0.002 });
  expect(last).toMatchObject({ action: "venda", all: true, chartExitIndices: [1, 2] });
  const closed = afterTrade(partial, last, {
    priceUsd: 200,
    bnb: 0.02,
    tokens: partial.tokens,
    now: market.now + 2,
  });
  expect(decide(cfg, normalizeState(closed, market.now + 86400000), market).action).toBe("nenhuma");
  expect(closed.chartFinished).toBe(true);
});
it("stop has priority over limits and permanently completes the activity", () => {
  const c = buildChartPlanConfig(
    { ...input, stopChoice: "price", stopBnb: 0.0004 },
    id,
    EMPTY_CONFIG,
  );
  expect(decide(c, EMPTY_STATE, { ...market, priceBnb: 0.0003 }).action).toBe("nenhuma");
  const s = fill();
  const d = decide(c, s, { ...market, priceBnb: 0.0003 });
  expect(d).toMatchObject({ action: "venda", all: true, chartRuleId: id });
  expect(
    afterTrade(s, d, { priceUsd: 30, bnb: 0.001, tokens: 10, now: market.now }).chartFinished,
  ).toBe(true);
});
it("reserves unfilled order amounts separately from actual position costs including gas", () => {
  const bot: CapitalBot = {
    id: "a",
    token: "a",
    armed: true,
    mode: "estrategia",
    order_bnb: 0,
    gas_reserve_bnb: 0,
    strat_state: EMPTY_STATE,
    config: cfg,
  };
  const original = walletCapital("0.03", [bot]);
  expect(original.free).toBe("0");
  expect(original.shortfall).toBe("0");
  const one = fill();
  bot.strat_state = { ...one, costBnb: Number(cfg.chartRule!.entries![0]!.amountBnb) + 0.00001 };
  const liquid = String(0.03 - Number(cfg.chartRule!.entries![0]!.amountBnb) - 0.00001);
  const after = walletCapital(liquid, [bot]);
  expect(Number(after.shortfall)).toBeLessThan(1e-16);
  expect(after.rows[0]!.reserved).toBe("0.01994");
  expect(planGasReserve(cfg, one)).toBe("0.00008");
  bot.strat_state = { ...one, chartExiting: true, chartExitsDone: [0] };
  expect(walletCapital("0.02", [bot])).toMatchObject({ reserved: "0", gas: "0.00004" });
  bot.strat_state = { ...one, tokens: 0, chartFinished: true };
  expect(walletCapital("0.02", [bot])).toMatchObject({ reserved: "0", gas: "0", free: "0.02" });
  expect(() => JSON.stringify(original)).not.toThrow();
});
it("automatic exits cover modeled costs for every possible filled prefix, not just the cheapest average", () => {
  const a = dividePlanBudget(input.budgetBnb, 3, 3, input.gasBuyBnb, input.gasSellBnb)!;
  const exits = suggestPlanExits({ ...input, amounts: a.amounts }, 3, 3);
  for (let n = 1; n <= 3; n++) {
    const p = planProjection({
      ...input,
      entryPrices: input.entryPrices.slice(0, n),
      amounts: a.amounts.slice(0, n),
      exitPrices: exits,
    })!;
    expect(p.netPct).toBeGreaterThanOrEqual(3 - 1e-8);
  }
  expect(planProjection({ ...input, amounts: ["NaN", "1", "1"] })).toBeNull();
});
