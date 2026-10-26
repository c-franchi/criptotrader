import { beforeEach, expect, it, vi } from "vitest";
import { EMPTY_CONFIG } from "./strategy";
import { buildChartPlanConfig, type ChartPlanInput } from "./chartPlan";
const io = vi.hoisted(() => ({
  scope: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  rpc: vi.fn(),
  balance: vi.fn(),
  capital: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./walletScope.server", () => ({ assertWalletScope: io.scope }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: io.from, rpc: io.rpc },
}));
vi.mock("./bot.server", () => ({ pubClient: () => ({ getBalance: io.balance }) }));
vi.mock("./walletCapital.server", () => ({ readWalletCapital: io.capital }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (validate: (v: unknown) => unknown) => ({
        handler: (fn: (arg: unknown) => unknown) => (args: { data: unknown }) =>
          fn({ data: validate(args.data), context: { userId: "owner" } }),
      }),
    }),
  }),
}));
import { saveChartPlan, updateChartGasLimit } from "./chartRule.functions";
const scope = "11111111-1111-4111-8111-111111111111",
  token = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
  address = "0x1111111111111111111111111111111111111111";
const settings: ChartPlanInput = {
  partialEntriesAccepted: false,
  budgetBnb: "0.02",
  entryPrices: [0.0008, 0.001],
  exitPrices: [0.0015, 0.0013],
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
const data = { walletScope: scope, token, settings, version: 7, draftRevision: 2 };
beforeEach(() => {
  vi.resetAllMocks();
  io.from.mockImplementation((table: string) => {
    const q = {
      select: () => q,
      eq: io.eq,
      ilike: () => q,
      maybeSingle: async () => ({
        data: table === "bot_wallets" ? { address } : { config: EMPTY_CONFIG },
        error: null,
      }),
    };
    io.eq.mockReturnValue(q);
    return q;
  });
  io.balance.mockResolvedValue(30000000000000000n);
  io.capital.mockResolvedValue({ free: "0.03" });
  io.rpc.mockResolvedValue({ data: "bot-id", error: null });
});
it("rechecks only this owner's actual robot BNB and free capital, then saves a sorted exact allocation using version fences", async () => {
  const result = await saveChartPlan({ data });
  expect(result.version).toBe(8);
  expect(io.scope).toHaveBeenCalledWith(expect.anything(), "owner", scope);
  expect(io.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(io.eq).toHaveBeenCalledWith("wallet_scope", scope);
  expect(io.balance).toHaveBeenCalledWith({ address });
  expect(io.capital).toHaveBeenCalledWith(expect.anything(), "owner", scope, "0.03");
  expect(io.rpc).toHaveBeenCalledWith(
    "configure_guided_bot",
    expect.objectContaining({
      p_user: "owner",
      p_scope: scope,
      p_version: 7,
      p_draft_revision: 2,
      p_config: expect.objectContaining({
        maxEntries: 2,
        chartRule: expect.objectContaining({
          version: 2,
          entries: [
            { priceBnb: 0.001, amountBnb: "0.00997" },
            { priceBnb: 0.0008, amountBnb: "0.00997" },
          ],
          exits: [
            { priceBnb: 0.0013, sharePct: 50 },
            { priceBnb: 0.0015, sharePct: 50 },
          ],
        }),
      }),
    }),
  );
  expect(io.rpc).toHaveBeenCalledTimes(1);
});
it("never borrows another bot's reservation or treats token valuations as native funds", async () => {
  io.capital.mockResolvedValue({ free: "0.001", balance: "0.03", invested: "100" });
  await expect(saveChartPlan({ data })).rejects.toThrow("supera o saldo livre");
  expect(io.rpc).not.toHaveBeenCalled();
});
it("rejects a foreign scope before querying its robot or balance", async () => {
  io.scope.mockRejectedValue(new Error("Carteira inválida"));
  await expect(saveChartPlan({ data })).rejects.toThrow("Carteira inválida");
  expect(io.from).not.toHaveBeenCalled();
  expect(io.balance).not.toHaveBeenCalled();
  expect(io.rpc).not.toHaveBeenCalled();
});
it("rejects stale versions or occupied positions without retry writes or starting a bot", async () => {
  io.rpc.mockResolvedValue({ data: null, error: { message: "conflict" } });
  await expect(saveChartPlan({ data })).rejects.toThrow("rascunho foi mantido");
  expect(io.rpc).toHaveBeenCalledTimes(1);
});
it("rejects exits whose projected value does not cover modeled costs", async () => {
  await expect(
    saveChartPlan({
      data: { ...data, settings: { ...settings, buyTaxPct: 30, exitPrices: [0.001001] } },
    }),
  ).rejects.toThrow("não cobrem as taxas");
  expect(io.rpc).not.toHaveBeenCalled();
});

it("requires explicit incomplete-entry acknowledgment without moving a profitable manual exit, and preserves the execution tolerance", async () => {
  const close = {
    ...settings,
    buyTaxPct: 0,
    sellTaxPct: 0,
    entryPrices: [0.001, 0.00095],
    exitPrices: [0.001001],
  };
  await expect(saveChartPlan({ data: { ...data, settings: close } })).rejects.toThrow(
    "entradas incompletas",
  );
  expect(io.rpc).not.toHaveBeenCalled();
  await saveChartPlan({ data: { ...data, settings: { ...close, partialEntriesAccepted: true } } });
  expect(io.rpc).toHaveBeenCalledWith(
    "configure_guided_bot",
    expect.objectContaining({
      p_config: expect.objectContaining({
        maxSlippagePct: 1,
        chartRule: expect.objectContaining({
          projectionVersion: 2,
          partialEntriesAccepted: true,
          exits: [{ priceBnb: 0.001001, sharePct: 100 }],
        }),
      }),
    }),
  );
});

function mockSavedLimit(version = 7) {
  const config = buildChartPlanConfig(
    settings,
    "11111111-1111-4111-8111-111111111111",
    EMPTY_CONFIG,
  );
  io.from.mockImplementation(() => {
    const q = {
      select: () => q,
      eq: io.eq,
      ilike: () => q,
      maybeSingle: async () => ({ data: { config, version }, error: null }),
    };
    io.eq.mockReturnValue(q);
    return q;
  });
  return config;
}
it("changes only the gas-price ceiling on explicit review using authenticated scope and version fences", async () => {
  const config = mockSavedLimit();
  await updateChartGasLimit({
    data: { walletScope: scope, token, maxGasGwei: 0.05, version: 7, draftRevision: 2 },
  });
  expect(io.scope).toHaveBeenCalledWith(expect.anything(), "owner", scope);
  expect(io.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(io.eq).toHaveBeenCalledWith("wallet_scope", scope);
  expect(io.rpc).toHaveBeenCalledTimes(1);
  expect(io.rpc).toHaveBeenCalledWith(
    "configure_guided_bot",
    expect.objectContaining({
      p_user: "owner",
      p_scope: scope,
      p_token: token,
      p_version: 7,
      p_draft_revision: 2,
      p_config: { ...config, maxGasGwei: 0.05 },
    }),
  );
  expect(io.balance).not.toHaveBeenCalled();
  expect(io.capital).not.toHaveBeenCalled();
});
it("does not revise a stale or foreign chart gas ceiling and never retries an occupied-position rejection", async () => {
  mockSavedLimit(8);
  await expect(
    updateChartGasLimit({
      data: { walletScope: scope, token, maxGasGwei: 0.05, version: 7, draftRevision: 2 },
    }),
  ).rejects.toThrow("As regras mudaram");
  expect(io.rpc).not.toHaveBeenCalled();
  mockSavedLimit(7);
  io.rpc.mockResolvedValue({ data: null, error: { message: "occupied" } });
  await expect(
    updateChartGasLimit({
      data: { walletScope: scope, token, maxGasGwei: 0.05, version: 7, draftRevision: 2 },
    }),
  ).rejects.toThrow("sem posição aberta");
  expect(io.rpc).toHaveBeenCalledTimes(1);
  io.rpc.mockClear();
  io.scope.mockRejectedValue(new Error("Carteira inválida"));
  await expect(
    updateChartGasLimit({
      data: { walletScope: scope, token, maxGasGwei: 0.05, version: 7, draftRevision: 2 },
    }),
  ).rejects.toThrow("Carteira inválida");
  expect(io.rpc).not.toHaveBeenCalled();
});
