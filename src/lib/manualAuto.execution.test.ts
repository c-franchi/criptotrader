/* eslint-disable @typescript-eslint/no-explicit-any -- isolated executor gateways */
import { beforeEach, expect, it, vi } from "vitest";
import { parseEther } from "viem";
import { EMPTY_STATE } from "./autoStrategy";
import { buildManualAutoConfig } from "./manualAuto";
const io = vi.hoisted(() => ({
  market: vi.fn(),
  history: vi.fn(),
  pool: vi.fn(),
  send: vi.fn(),
  approve: vi.fn(),
  balance: vi.fn(),
  read: vi.fn(),
  capital: vi.fn(),
}));
vi.mock("./market.server", () => ({ readMarket: io.market }));
vi.mock("./history.server", () => ({ readCandles: io.history }));
vi.mock("./tokenMeta.server", () => ({ tokenMeta: async () => ({ decimals: 18 }) }));
vi.mock("./walletCapital.server", () => ({ readWalletCapital: io.capital }));
vi.mock("./bot.server", () => ({
  poolState: io.pool,
  pubClient: () => ({ getBalance: io.balance, readContract: io.read }),
  botSigner: async () => ({
    account: { address: "0x1111111111111111111111111111111111111111" },
    wallet: {},
  }),
  sendSwap: io.send,
  approveForSwap: io.approve,
}));
import { runStrategyStep } from "./strategyBot.server";
const cfg = buildManualAutoConfig(
  {
    capitalBnb: 0.001,
    entryMode: "price",
    entryValue: 100,
    exitMode: "price",
    exitValue: 100.01,
    stopLossPct: null,
    slippagePct: 1,
    buyTaxPct: 8,
    sellTaxPct: 8,
  },
  100,
  "11111111-1111-4111-8111-111111111111",
);
const bot = {
  id: "b",
  user_id: "u",
  token: "0x2222222222222222222222222222222222222222",
  strat_state: EMPTY_STATE,
};
function admin() {
  const q: any = {
    select: () => q,
    eq: () => q,
    ilike: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: { config: cfg } }),
    insert: async () => ({ error: null }),
  };
  return { from: () => q };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.market.mockResolvedValue({
    error: null,
    fetchedAt: new Date().toISOString(),
    pools: [{ supported: true, pairAddress: "pair", priceUsd: "100", liquidityUsd: 0 }],
  });
  io.pool.mockResolvedValue({
    pair: "pair",
    price: 0.1,
    bnb: parseEther("1000"),
    tok: parseEther("1000"),
  });
  io.balance.mockResolvedValue(parseEther("0.1"));
  io.read.mockResolvedValue(parseEther("1"));
  io.capital.mockResolvedValue({
    rows: [{ id: "b", available: "0.1", reserved: "0.001" }],
    reserved: "0.001",
  });
  io.send.mockResolvedValue({ net: 1n, order: { status: "confirmada", tx_hash: "0x1234" } });
  io.approve.mockResolvedValue(true);
});
it("executes the owner's entry without candle, minimum liquidity, profit-margin or configured gas-ceiling gates", async () => {
  const r = await runStrategyStep(admin(), bot, "enc", "owner");
  expect(r.order?.status).toBe("confirmada");
  expect(io.history).not.toHaveBeenCalled();
  const call = io.send.mock.calls[0]![0];
  expect(call.amountIn).toBe(parseEther("0.001"));
  expect(call.maxGasGwei).toBeUndefined();
  expect(call.intent.feeTargetGrossPct).toBeUndefined();
  expect(call.intent.chartPlanExecution).toBeUndefined();
  expect(call.taxPct).toBe(8);
  expect(call.slippagePct).toBe(1);
});
it("executes the precise exit even if taxes exceed its spread", async () => {
  io.market.mockResolvedValue({
    error: null,
    fetchedAt: new Date().toISOString(),
    pools: [{ supported: true, pairAddress: "pair", priceUsd: "100.01", liquidityUsd: 0 }],
  });
  await runStrategyStep(
    admin(),
    { ...bot, strat_state: { ...EMPTY_STATE, tokens: 1, avgPriceUsd: 100 } },
    "enc",
    "owner",
  );
  expect(io.approve).toHaveBeenCalled();
  expect(io.approve.mock.calls[0]![0].maxGasGwei).toBeUndefined();
  expect(io.send.mock.calls[0]![0]).toMatchObject({ side: "venda", taxPct: 8 });
  expect(io.send.mock.calls[0]![0].maxGasGwei).toBeUndefined();
  expect(io.history).not.toHaveBeenCalled();
});
it("still refuses to spend capital that is not actually available", async () => {
  io.capital.mockResolvedValue({
    rows: [{ id: "b", available: "0.00001", reserved: "0.001" }],
    reserved: "0.001",
  });
  const r = await runStrategyStep(admin(), bot, "enc", "owner");
  expect(r.order).toBeNull();
  expect(io.send).not.toHaveBeenCalled();
});
