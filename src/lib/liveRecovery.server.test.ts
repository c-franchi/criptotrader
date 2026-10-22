/* eslint-disable @typescript-eslint/no-explicit-any -- server query-chain test doubles */
import { afterEach, expect, it, vi } from "vitest";
import { EMPTY_CONFIG } from "./strategy";
import { EMPTY_STATE } from "./autoStrategy";
const mock = vi.hoisted(() => ({ send: vi.fn(), signer: vi.fn(), now: 1_800_000_000_000 }));
vi.mock("./bot.server", () => ({
  poolState: async () => ({
    pair: "0x2222222222222222222222222222222222222222",
    bnb: 100000000000000000000n,
  }),
  pubClient: () => ({ getBalance: async () => 100000000000000000n }),
  botSigner: mock.signer,
  sendSwap: mock.send,
  approveForSwap: vi.fn(),
}));
vi.mock("./tokenMeta.server", () => ({ tokenMeta: async () => ({ decimals: 18 }) }));
vi.mock("./market.server", () => ({
  readMarket: async () => ({
    fetchedAt: new Date(mock.now).toISOString(),
    error: null,
    source: "test",
    pools: [
      {
        supported: true,
        pairAddress: "0x2222222222222222222222222222222222222222",
        priceUsd: "76",
        liquidityUsd: 100000,
      },
    ],
  }),
}));
vi.mock("./history.server", () => ({
  readCandles: async () => {
    const v = [...Array(22).fill(100), 85, 74, 75, 76];
    return v.map((p, i) => [mock.now / 1000 - (v.length - i) * 300, p, p, p, p, 1]);
  },
}));
import { runStrategyStep } from "./strategyBot.server";
afterEach(() => vi.restoreAllMocks());
it("routes confirmed recovery through the real swap executor with the decision persisted in the intent", async () => {
  vi.spyOn(Date, "now").mockReturnValue(mock.now);
  mock.signer.mockResolvedValue({
    account: { address: "0x3333333333333333333333333333333333333333" },
    wallet: {},
  });
  mock.send.mockResolvedValue({ order: { status: "confirmada", tx_hash: "0xtest" }, net: 100n });
  const config = {
    ...EMPTY_CONFIG,
    buyAmount: 0.001,
    sizingMode: "fixo",
    entryType: "adaptativa",
    candleInterval: "5m",
    cooldownMin: 0,
    buyTaxPct: 8,
    sellTaxPct: 8,
    taxVerified: true,
    recovery: {
      enabled: true,
      minDropPct: 8,
      reboundPct: 2,
      maxReboundPct: 8,
      confirmationBars: 2,
      minNetPct: 1.5,
    },
  };
  const admin = {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        ilike: () => q,
        neq: () => q,
        order: () => q,
        limit: () => q,
        insert: async () => ({ error: null }),
        maybeSingle: async () => ({
          data: table === "strategies" ? { config } : null,
          error: null,
        }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return q;
    },
  };
  const bot = {
    id: "b",
    user_id: "u",
    token: "0x1111111111111111111111111111111111111111",
    strat_state: { ...EMPTY_STATE },
  };
  const preview = await runStrategyStep(admin, bot, "", "", true);
  expect(preview.order).toBeNull();
  expect(mock.send).not.toHaveBeenCalled();
  const actual = await runStrategyStep(admin, bot, "encrypted", "lock-owner");
  expect(actual.order?.status).toBe("confirmada");
  expect(mock.send).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: "lock-owner",
      side: "compra",
      amountIn: 1000000000000000n,
      intent: expect.objectContaining({
        decision: expect.objectContaining({ action: "compra", recoveryLowAt: expect.any(Number) }),
      }),
    }),
  );
  expect(bot.strat_state).toEqual(EMPTY_STATE);
});
