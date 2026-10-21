import { expect, it, vi } from "vitest";
import { EMPTY_CONFIG } from "./strategy";
import { EMPTY_STATE } from "./autoStrategy";
const m = vi.hoisted(() => ({ signer: vi.fn(), now: 1800000000000 }));
vi.mock("./bot.server", () => ({
  poolState: async () => ({ pair: "0x2222222222222222222222222222222222222222" }),
  botSigner: m.signer,
  pubClient: vi.fn(),
  sendSwap: vi.fn(),
  approveForSwap: vi.fn(),
}));
vi.mock("./market.server", () => ({
  readMarket: async () => ({
    fetchedAt: new Date(m.now).toISOString(),
    error: null,
    source: "test",
    pools: [
      {
        supported: true,
        pairAddress: "0x2222222222222222222222222222222222222222",
        priceUsd: "80",
        liquidityUsd: 100000,
      },
    ],
  }),
}));
vi.mock("./history.server", () => ({
  readCandles: async () =>
    Array.from({ length: 30 }, (_, i) => [m.now / 1000 - (30 - i) * 300, 100, 101, 99, 100, 10]),
}));
import { runStrategyStep } from "./strategyBot.server";
it("can analyze a buy signal without signing, journal writes, or changing the position", async () => {
  vi.spyOn(Date, "now").mockReturnValue(m.now);
  const from = vi.fn((_table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query-chain test double.
    const q: any = {
      select: () => q,
      eq: () => q,
      ilike: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({
        data: {
          config: {
            ...EMPTY_CONFIG,
            entryType: "queda",
            referenceType: "manual",
            manualReference: 100,
            dropPct: 10,
            buyAmount: 0.01,
            taxVerified: true,
            buyTaxPct: 0,
            sellTaxPct: 0,
          },
        },
      }),
    };
    return q;
  });
  const state = { ...EMPTY_STATE };
  const bot = {
    id: "b",
    user_id: "u",
    token: "0x1111111111111111111111111111111111111111",
    strat_state: state,
  };
  const result = await runStrategyStep({ from }, bot, "", "", true);
  expect(result.order).toBeNull();
  expect((result.patch as Record<string, unknown>)["last_error"]).toBeNull();
  expect((result.patch as Record<string, unknown>)["last_reason"]).toMatch(/Caiu/);
  expect(m.signer).not.toHaveBeenCalled();
  expect(from.mock.calls.map((c) => c[0])).toEqual(["strategies"]);
  expect(bot.strat_state).toEqual(state);
  vi.restoreAllMocks();
});
