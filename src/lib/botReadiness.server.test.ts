/* eslint-disable @typescript-eslint/no-explicit-any -- isolated read-only gateway test doubles */
import { beforeEach, it, expect, vi } from "vitest";
import { buildChartPlanConfig, type ChartPlanInput } from "./chartPlan";
import { EMPTY_CONFIG } from "./strategy";
const m = vi.hoisted(() => ({
  pool: vi.fn(),
  market: vi.fn(),
  capital: vi.fn(),
  balance: vi.fn(),
  estimate: vi.fn(),
  quote: vi.fn(),
}));
vi.mock("./bot.server", () => ({
  poolState: m.pool,
  pubClient: () => ({
    getBalance: m.balance,
    getGasPrice: async () => 1000000000n,
    estimateContractGas: m.estimate,
    readContract: m.quote,
  }),
}));
vi.mock("./market.server", () => ({ readMarket: m.market }));
vi.mock("./walletCapital.server", () => ({ readWalletCapital: m.capital }));
import { readBotReadiness } from "./botReadiness.server";
const token = "0x1111111111111111111111111111111111111111",
  pair = "0x2222222222222222222222222222222222222222";
function admin() {
  return {
    from: (t: string) => {
      const rows: any = {
        grid_bots: {
          id: "b",
          updated_at: "2026-10-23",
          mode: "estrategia",
          strat_state: { tokens: 0 },
        },
        strategies: {
          version: 1,
          config: {
            ...EMPTY_CONFIG,
            buyAmount: 0.001,
            sizingMode: "fixo",
            takeProfits: [{ pct: 4, sellPct: 100 }],
            taxVerified: true,
          },
        },
        bot_wallets: { address: token },
        bot_execution_locks: null,
      };
      const q: any = {
        select: () => q,
        eq: () => q,
        ilike: () => q,
        is: () => q,
        maybeSingle: async () => ({ data: rows[t], error: null }),
      };
      return q;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.pool.mockResolvedValue({ pair, price: 0.01 });
  m.market.mockResolvedValue({
    error: null,
    fetchedAt: new Date().toISOString(),
    pools: [{ pairAddress: pair, supported: true, priceUsd: "100", liquidityUsd: 100000 }],
  });
  m.balance.mockResolvedValue(100000000000000000n);
  m.capital.mockResolvedValue({
    shortfall: "0",
    rows: [{ id: "b", available: "0.09", reserved: "0.001" }],
  });
  m.estimate.mockResolvedValue(100000n);
  m.quote.mockResolvedValue([1000000000000000n, 990000000000000n]);
});
it("blocks incompatible assets before market, wallet or gas calls", async () => {
  const a = { from: vi.fn() };
  const r = await readBotReadiness(a, "u", "s", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c");
  expect(r.ready).toBe(false);
  expect(r.errors[0]).toMatch(/mesmo ativo/);
  expect(a.from).not.toHaveBeenCalled();
  expect(m.balance).not.toHaveBeenCalled();
});
it("does not call a market chart a tradeable execution price", async () => {
  m.pool.mockResolvedValue(null);
  const r = await readBotReadiness(admin(), "u", "s", token);
  expect(r.ready).toBe(false);
  expect(r.errors.join(" ")).toMatch(/par BNB compatível/);
  expect(m.estimate).not.toHaveBeenCalled();
});
it("blocks when known costs eat the target and reports the actual buy fee", async () => {
  const r = await readBotReadiness(admin(), "u", "s", token);
  expect(r.ready).toBe(false);
  expect(r.feeBnb).toBeCloseTo(0.0001);
  expect(r.errors.join(" ")).toMatch(/consomem a margem/);
});
it("allows a viable setup after read-only checks and fails closed on unavailable gas estimation", async () => {
  m.estimate.mockResolvedValue(1000n);
  expect((await readBotReadiness(admin(), "u", "s", token)).ready).toBe(true);
  m.estimate.mockRejectedValue(new Error("unavailable"));
  const r = await readBotReadiness(admin(), "u", "s", token);
  expect(r.ready).toBe(false);
  expect(r.errors.join(" ")).toMatch(/Nada foi enviado/);
});

it("returns an actionable liquidity blocker with measured and required values", async () => {
  const a = admin();
  const original = a.from;
  a.from = (table: string) => {
    if (table !== "strategies") return original(table);
    const q: any = {
      select: () => q,
      eq: () => q,
      ilike: () => q,
      maybeSingle: async () => ({
        data: {
          version: 1,
          config: {
            ...EMPTY_CONFIG,
            minLiquidityUsd: 5000,
            buyAmount: 0.001,
            takeProfits: [{ pct: 4, sellPct: 100 }],
            taxVerified: true,
          },
        },
        error: null,
      }),
    };
    return q;
  };
  m.market.mockResolvedValue({
    error: null,
    fetchedAt: new Date().toISOString(),
    pools: [{ pairAddress: pair, supported: true, priceUsd: "100", liquidityUsd: 2500 }],
  });
  const result = await readBotReadiness(a, "u", "s", token);
  expect(result).toMatchObject({ ready: false, liquidityUsd: 2500, minLiquidityUsd: 5000 });
  expect(result.issues).toContainEqual({
    action: "liquidity",
    message: expect.stringMatching(/US\$ 2.500.*US\$ 5.000/),
  });
  expect(m.estimate).not.toHaveBeenCalled();
});

function chartAdmin(input: Partial<ChartPlanInput> = {}) {
  const cfg = buildChartPlanConfig(
    {
      budgetBnb: "0.02",
      entryPrices: [0.001, 0.00095],
      exitPrices: [0.001001],
      stopBnb: null,
      stopChoice: "none",
      buyTaxPct: 0,
      sellTaxPct: 0,
      taxesConfirmed: true,
      acknowledge: true,
      gasBuyBnb: 0.00001,
      gasSellBnb: 0.00002,
      executionMarginPct: 1,
      maxGasGwei: 5,
      minLiquidityUsd: 0,
      partialEntriesAccepted: true,
      ...input,
    },
    "11111111-1111-4111-8111-111111111111",
    EMPTY_CONFIG,
  );
  const a = admin(),
    original = a.from;
  a.from = (table: string) => {
    if (table !== "strategies") return original(table);
    const q: any = {
      select: () => q,
      eq: () => q,
      ilike: () => q,
      maybeSingle: async () => ({ data: { version: 1, config: cfg }, error: null }),
    };
    return q;
  };
  return a;
}
it("accepts a profitable combined chart plan without raising manually selected exits to the first-entry-only target", async () => {
  m.estimate.mockResolvedValue(1000n);
  m.quote.mockImplementation(async ({ args }: { args: bigint[] }) => [
    args[0],
    (args[0]! * 9975n) / 10000n,
  ]);
  const r = await readBotReadiness(chartAdmin(), "u", "s", token);
  expect(r.ready).toBe(true);
  expect(r.warnings.join(" ")).toContain("Compras incompletas");
});
it("requires incomplete-entry acknowledgment for new chart plans rather than silently lifting their prices", async () => {
  m.estimate.mockResolvedValue(1000n);
  m.quote.mockImplementation(async ({ args }: { args: bigint[] }) => [
    args[0],
    (args[0]! * 9975n) / 10000n,
  ]);
  const r = await readBotReadiness(chartAdmin({ partialEntriesAccepted: false }), "u", "s", token);
  expect(r.ready).toBe(false);
  expect(r.errors.join(" ")).toContain("compras incompletas");
});
it("still blocks known current exchange costs that consume the full position margin", async () => {
  m.estimate.mockResolvedValue(1000n);
  m.quote.mockResolvedValue([1000000000000000n, 900000000000000n]);
  const r = await readBotReadiness(chartAdmin(), "u", "s", token);
  expect(r.ready).toBe(false);
  expect(r.errors.join(" ")).toContain("taxas e o gás estimados agora");
});

it("distinguishes a low gas-price ceiling from a funded wallet and reports both prices and BNB references", async () => {
  const a = admin(),
    original = a.from;
  a.from = (table: string) => {
    if (table !== "strategies") return original(table);
    const q: any = {
      select: () => q,
      eq: () => q,
      ilike: () => q,
      maybeSingle: async () => ({
        data: {
          version: 1,
          config: {
            ...EMPTY_CONFIG,
            buyAmount: 0.001,
            sizingMode: "fixo",
            taxVerified: true,
            maxGasGwei: 0.0001,
            takeProfits: [{ pct: 4, sellPct: 100 }],
          },
        },
        error: null,
      }),
    };
    return q;
  };
  const r = await readBotReadiness(a, "u", "s", token);
  expect(r).toMatchObject({
    ready: false,
    networkGasGwei: "1",
    configuredGasGwei: 0.0001,
    gasBuyReferenceBnb: "0.0003",
    gasSellReferenceBnb: "0.00046",
    available: "0.09",
  });
  expect(r.issues).toContainEqual({
    action: "gas",
    message: expect.stringMatching(/1 gwei.*0,0001 gwei.*não do saldo/),
  });
});
