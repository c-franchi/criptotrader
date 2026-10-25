import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EMPTY_CONFIG } from "./strategy";
import type { ChartRuleInput } from "./chartRule";
const io = vi.hoisted(() => ({ assertScope: vi.fn(), from: vi.fn(), rpc: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./walletScope.server", () => ({ assertWalletScope: io.assertScope }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: io.from, rpc: io.rpc },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (validate: (data: unknown) => unknown) => ({
        handler:
          (fn: (args: { data: unknown; context: { userId: string } }) => unknown) =>
          (args: { data: unknown }) =>
            fn({ data: validate(args.data), context: { userId: "authenticated-owner" } }),
      }),
    }),
  }),
}));
import { saveChartRule } from "./chartRule.functions";
const scope = "11111111-1111-4111-8111-111111111111";
const token = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
const settings: ChartRuleInput = {
  entryBnb: 0.001,
  exitBnb: 0.0013,
  stopBnb: null,
  stopChoice: "none",
  amountBnb: 0.01,
  buyTaxPct: 0,
  sellTaxPct: 0,
  taxesConfirmed: true,
  dexFeePct: 0.25,
  executionMarginPct: 1,
  gasBuyBnb: 0.00001,
  gasSellBnb: 0.00002,
  costsConfirmed: true,
  reserveBnb: 0.0001,
  maxGasGwei: 5,
  minLiquidityUsd: 5000,
  acknowledge: true,
};
beforeEach(() => {
  const q = {
    select: () => q,
    eq: io.eq,
    ilike: () => q,
    maybeSingle: async () => ({ data: { config: EMPTY_CONFIG }, error: null }),
  };
  io.eq.mockReturnValue(q);
  io.from.mockReturnValue(q);
  io.rpc.mockResolvedValue({ data: "bot-id", error: null });
  io.assertScope.mockResolvedValue(undefined);
});
afterEach(() => vi.resetAllMocks());
it("saves a validated rule using the authenticated owner, scope and fenced paused-bot RPC", async () => {
  const result = await saveChartRule({
    data: { walletScope: scope, token, settings, version: 7, draftRevision: 2 },
  });
  expect(result.version).toBe(8);
  expect(io.assertScope).toHaveBeenCalledWith(expect.anything(), "authenticated-owner", scope);
  expect(io.eq).toHaveBeenCalledWith("user_id", "authenticated-owner");
  expect(io.eq).toHaveBeenCalledWith("wallet_scope", scope);
  expect(io.rpc).toHaveBeenCalledWith(
    "configure_guided_bot",
    expect.objectContaining({
      p_user: "authenticated-owner",
      p_scope: scope,
      p_token: token,
      p_version: 7,
      p_draft_revision: 2,
      p_config: expect.objectContaining({
        guidedModel: "chart",
        chartRule: expect.objectContaining({
          unit: "BNB",
          entryBnb: 0.001,
          exitBnb: 0.0013,
          stopBnb: null,
        }),
      }),
    }),
  );
  expect(io.rpc).toHaveBeenCalledTimes(1);
});
it("stops before reading or writing another owner's scope", async () => {
  io.assertScope.mockRejectedValue(new Error("Carteira não pertence a esta conta"));
  await expect(
    saveChartRule({ data: { walletScope: scope, token, settings, version: 0, draftRevision: 0 } }),
  ).rejects.toThrow("não pertence");
  expect(io.from).not.toHaveBeenCalled();
  expect(io.rpc).not.toHaveBeenCalled();
});
it("keeps position/version/lock rejection as an error without a fallback write or automatic start", async () => {
  io.rpc.mockResolvedValue({
    data: null,
    error: { message: "Pause o robô e aguarde encerrar a posição" },
  });
  await expect(
    saveChartRule({ data: { walletScope: scope, token, settings, version: 7, draftRevision: 2 } }),
  ).rejects.toThrow("Não foi possível salvar");
  expect(io.rpc).toHaveBeenCalledTimes(1);
});
it("refuses a target consumed by estimated costs before persistence", async () => {
  await expect(
    saveChartRule({
      data: {
        walletScope: scope,
        token,
        settings: { ...settings, exitBnb: 0.001001 },
        version: 0,
        draftRevision: 0,
      },
    }),
  ).rejects.toThrow("não cobre");
  expect(io.rpc).not.toHaveBeenCalled();
});
