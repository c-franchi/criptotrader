/* eslint-disable @typescript-eslint/no-explicit-any -- isolated server I/O doubles */
import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({
  market: vi.fn(),
  history: vi.fn(),
  pool: vi.fn(),
  signer: vi.fn(),
}));
vi.mock("./market.server", () => ({ readMarket: io.market }));
vi.mock("./history.server", () => ({ readCandles: io.history }));
vi.mock("./bot.server", () => ({
  poolState: io.pool,
  botSigner: io.signer,
  pubClient: vi.fn(),
  sendSwap: vi.fn(),
  approveForSwap: vi.fn(),
}));
import { runStrategyStep } from "./strategyBot.server";
import { EMPTY_CONFIG } from "./strategy";
import { EMPTY_STATE } from "./autoStrategy";
const token = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
const pair = "0x1111111111111111111111111111111111111111";
const config = {
  ...EMPTY_CONFIG,
  rulesVersion: 2,
  buyAmount: 0.001,
  takeProfits: [{ pct: 3, sellPct: 100 }],
  stopLossPct: 15,
};
const bot = {
  id: "b",
  user_id: "u",
  token,
  strat_state: { ...EMPTY_STATE, tokens: 1, avgPriceUsd: 100, peakUsd: 100 },
};
function admin(cfg = config) {
  const q: any = {
    select: () => q,
    eq: () => q,
    ilike: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: { config: cfg } }),
  };
  return { from: () => q };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.pool.mockResolvedValue({ pair });
  io.market.mockResolvedValue({
    fetchedAt: new Date().toISOString(),
    error: null,
    source: "on-chain",
    pools: [{ supported: true, pairAddress: pair, priceUsd: "103", liquidityUsd: 100000 }],
  });
  io.history.mockResolvedValue([]);
});
it("evaluates a touched take-profit without joining slow historical candle reads or signing in preview", async () => {
  io.history.mockImplementation(() => new Promise(() => {}));
  const result = await runStrategyStep(admin(), bot, "", "", true);
  expect(result.patch).toMatchObject({
    last_price: 103,
    last_error: null,
    last_reason: expect.stringMatching(/Take-profit/),
  });
  expect(io.history).not.toHaveBeenCalled();
  expect(io.signer).not.toHaveBeenCalled();
});
it("evaluates a protective exit without history and without being gated by buy limits", async () => {
  io.market.mockResolvedValue({
    fetchedAt: new Date().toISOString(),
    error: null,
    pools: [{ supported: true, pairAddress: pair, priceUsd: "85", liquidityUsd: 0 }],
  });
  const result = await runStrategyStep(
    admin(),
    { ...bot, strat_state: { ...bot.strat_state, lastTradeAt: Date.now(), tradesToday: 500 } },
    "",
    "",
    true,
  );
  expect(result.patch).toMatchObject({ last_reason: expect.stringMatching(/Stop-loss/) });
  expect(io.history).not.toHaveBeenCalled();
});
it("does not treat a historical wick or the current-price line as a sale target", async () => {
  io.market.mockResolvedValue({
    fetchedAt: new Date().toISOString(),
    error: null,
    pools: [{ supported: true, pairAddress: pair, priceUsd: "100.3", liquidityUsd: 100000 }],
  });
  io.history.mockResolvedValue([[Math.floor(Date.now() / 1000) - 900, 100, 110, 99, 100]]);
  const result = await runStrategyStep(admin(), bot, "", "", true);
  expect(result.patch).toHaveProperty("last_reason");
  expect(String((result.patch as Record<string, unknown>)["last_reason"])).not.toMatch(
    /Take-profit/,
  );
  expect(io.history).toHaveBeenCalledWith(pair, token.toLowerCase(), { fast: true });
});
it("refuses stale exit quotes before consulting history or signing", async () => {
  io.market.mockResolvedValue({
    fetchedAt: new Date(Date.now() - 20000).toISOString(),
    error: null,
    pools: [{ supported: true, pairAddress: pair, priceUsd: "110", liquidityUsd: 100000 }],
  });
  const result = await runStrategyStep(admin(), bot, "", "", true);
  expect(result.patch.last_error).toMatch(/Preço desatualizado/);
  expect(io.history).not.toHaveBeenCalled();
  expect(io.signer).not.toHaveBeenCalled();
});
it("retains closed-history evaluation for adaptive targets", async () => {
  await runStrategyStep(admin({ ...config, entryType: "adaptativa" }), bot, "", "", true);
  expect(io.history).toHaveBeenCalled();
});
