/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, expect, it, vi } from "vitest";
import { readFundsOverview } from "./fundsOverview.server";
import { fundsTotal } from "./fundsOverview";
import { EMPTY_CONFIG } from "./strategy";
const mocks = vi.hoisted(() => ({ market: vi.fn(), meta: vi.fn() }));
vi.mock("./market.server", () => ({ readMarket: mocks.market }));
vi.mock("./tokenMeta.server", () => ({ tokenMeta: mocks.meta }));
const a = "0x" + "1".repeat(40),
  b = "0x" + "2".repeat(40),
  token = "0x" + "3".repeat(40);
afterEach(() => vi.resetAllMocks());
function setup(locked = false) {
  const tables: Record<string, any[]> = {
    user_wallets: [
      { user_id: "owner", id: "scope", address: a, label: "Principal" },
      { user_id: "other", id: "foreign", address: token },
    ],
    bot_wallets: [{ user_id: "owner", wallet_scope: "scope", address: b }],
    user_tokens: [{ user_id: "owner", address: token }],
    grid_bots: [
      {
        user_id: "owner",
        id: "bot",
        token,
        wallet_scope: "scope",
        armed: true,
        mode: "estrategia",
        order_bnb: "0.1",
        gas_reserve_bnb: "0.01",
        strat_state: {},
        archived_at: null,
      },
    ],
    strategies: [
      {
        user_id: "owner",
        token,
        wallet_scope: "scope",
        config: {
          ...EMPTY_CONFIG,
          gasReserveBnb: 0.01,
          buyAmount: 0.1,
          sizingMode: "fixo",
          maxEntries: 1,
        },
      },
    ],
    bot_execution_locks: locked ? [{ user_id: "owner", wallet_scope: "scope" }] : [],
    execution_submissions: [],
  };
  const calls: { table: string; select?: string; user?: string }[] = [];
  const admin = {
    from: (table: string) => {
      const call = { table } as (typeof calls)[number];
      calls.push(call);
      const query: any = {
        select: (s: string) => {
          call.select = s;
          return query;
        },
        eq: (_c: string, v: string) => {
          call.user = v;
          return query;
        },
        is: () => query,
        limit: () => query,
        then: (resolve: any) =>
          Promise.resolve({
            data: (tables[table] ?? []).filter((r) => r.user_id === call.user),
            error: null,
          }).then(resolve),
      };
      return query;
    },
  };
  const pub = {
    getBlockNumber: async () => 42n,
    getBlock: async () => ({ timestamp: 1000n }),
    getBalance: vi.fn(async (x: any) =>
      x.address.toLowerCase() === a ? 10n ** 18n : 2n * 10n ** 18n,
    ),
    multicall: vi.fn(async (x: any) =>
      x.contracts.map((c: any) => ({
        status: "success",
        result:
          c.address.toLowerCase() === token && c.args[0].toLowerCase() === b
            ? 100n * 10n ** 18n
            : 0n,
      })),
    ),
  };
  mocks.meta.mockResolvedValue({ symbol: "T", name: "Test Token", decimals: 18 });
  mocks.market.mockResolvedValue({
    pools: [{ supported: true, priceNative: "0.002" }],
    logoUrl: "https://cdn.dexscreener.com/token.png",
    error: null,
  });
  return { admin, pub, calls, tables };
}
it("isolates all metadata by user and pins every balance to the same block", async () => {
  const { admin, pub, calls } = setup();
  const r = await readFundsOverview(admin, pub, "owner");
  expect(r.wallets).toHaveLength(2);
  expect(fundsTotal(r.wallets).total).toBe("3.2");
  expect(calls.every((c) => c.user === "owner")).toBe(true);
  expect(calls.find((c) => c.table === "bot_wallets")?.select).toBe("address,wallet_scope");
  for (const [request] of pub.getBalance.mock.calls) expect(request.blockNumber).toBe(42n);
  for (const [request] of pub.multicall.mock.calls) expect(request.blockNumber).toBe(42n);
  expect(r.wallets[1]?.capital?.free).toBe("1.89");
  expect(r.wallets[1]?.assets[0]).toMatchObject({
    name: "Test Token",
    logoUrl: "https://cdn.dexscreener.com/token.png",
  });
});
it("keeps all holdings in the total but does not advertise locked BNB as free", async () => {
  const { admin, pub } = setup(true);
  const r = await readFundsOverview(admin, pub, "owner");
  expect(r.wallets[1]?.capital?.free).toBeNull();
  expect(fundsTotal(r.wallets).total).toBe("3.2");
});
it("preserves token quantity without inventing a price on source failure", async () => {
  const { admin, pub } = setup();
  mocks.market.mockRejectedValue(new Error("unavailable"));
  const r = await readFundsOverview(admin, pub, "owner");
  expect(r.wallets[1]?.assets[0]?.amount).toBe("100");
  expect(fundsTotal(r.wallets)).toMatchObject({ total: null, known: "3", missingAssets: 1 });
});
it("does not assign another robot wallet's reservations to a personal address saved as a scope", async () => {
  const { admin, pub, tables } = setup();
  tables["bot_wallets"]!.push({ user_id: "owner", wallet_scope: "old", address: a });
  tables["grid_bots"]!.push({ ...tables["grid_bots"]![0], id: "oldbot", wallet_scope: "old" });
  tables["strategies"]!.push({ ...tables["strategies"]![0], wallet_scope: "old" });
  const r = await readFundsOverview(admin, pub, "owner");
  expect(r.wallets).toHaveLength(2);
  expect(r.wallets[0]?.capital?.reserved).toBe("0.1");
  expect(r.wallets[1]?.capital?.reserved).toBe("0.1");
});
