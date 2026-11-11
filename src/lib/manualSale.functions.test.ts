import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ scope: vi.fn(), read: vi.fn(), upsert: vi.fn(), contract: vi.fn(), block: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ middleware: () => ({ inputValidator: (validate: (v: unknown) => unknown) => ({ handler: (fn: (v: unknown) => unknown) => (args: { data: unknown }) => fn({ data: validate(args.data), context: { userId: "owner", supabase: { from: () => ({ upsert: io.upsert }) } } }) }) }) }) }));
vi.mock("./manualSale.server", () => ({ assertManualScope: io.scope, readSaleLimits: io.read }));
vi.mock("./bot.server", () => ({ pubClient: () => ({ getBlockNumber: io.block, readContract: io.contract }) }));
import { saveManualSaleLimits, validateManualSale } from "./manualSale.functions";
const token = "0x1111111111111111111111111111111111111111";
const walletScope = "22222222-2222-4222-8222-222222222222";
const limits = { maxPriceImpactPct: 2, maxSlippagePct: 1 };
beforeEach(() => { vi.resetAllMocks(); io.upsert.mockResolvedValue({ error: null }); io.read.mockResolvedValue({ limits }); io.block.mockResolvedValue(10n); io.contract.mockImplementation(async (args) => args.functionName === "getPair" ? token : args.functionName === "token0" ? token : [1000n, 1000n, 1]); });
it("persists only this user's wallet/token limits, leaving strategies out of the write", async () => {
  await expect(saveManualSaleLimits({ data: { walletScope, token, limits } })).resolves.toEqual(limits);
  expect(io.scope).toHaveBeenCalledWith(expect.anything(), "owner", walletScope);
  expect(io.upsert).toHaveBeenCalledWith({ user_id: "owner", wallet_scope: walletScope, token, max_price_impact_pct: 2, max_slippage_pct: 1 }, { onConflict: "user_id,wallet_scope,token" });
});
it("does not claim success when persistence fails", async () => {
  io.upsert.mockResolvedValue({ error: { message: "failure" } });
  await expect(saveManualSaleLimits({ data: { walletScope, token, limits } })).rejects.toThrow("Não foi possível salvar");
});
it("refuses a foreign wallet before saving", async () => {
  io.scope.mockRejectedValue(new Error("foreign"));
  await expect(saveManualSaleLimits({ data: { walletScope, token, limits } })).rejects.toThrow();
  expect(io.upsert).not.toHaveBeenCalled();
});
it("rejects out-of-range edits before persistence", async () => {
  await expect(saveManualSaleLimits({ data: { walletScope, token, limits: { ...limits, maxPriceImpactPct: 21 } } })).rejects.toThrow();
  expect(io.upsert).not.toHaveBeenCalled();
});
it("validates against actual saved limits and one fresh block", async () => {
  await expect(validateManualSale({ data: { walletScope, token, limits, amount: "10" } })).resolves.toMatchObject({ impact: 0.9900 });
  for (const [args] of io.contract.mock.calls) expect(args.blockNumber).toBe(10n);
});
it("cannot bypass a zero server limit with a different client value", async () => {
  io.read.mockResolvedValue({ limits: { ...limits, maxPriceImpactPct: 0 } });
  await expect(validateManualSale({ data: { walletScope, token, limits, amount: "10" } })).rejects.toThrow("mudaram");
  expect(io.contract).not.toHaveBeenCalled();
});
it("blocks zero impact even with high slippage", async () => {
  const zero = { maxPriceImpactPct: 0, maxSlippagePct: 7 }; io.read.mockResolvedValue({ limits: zero });
  await expect(validateManualSale({ data: { walletScope, token, limits: zero, amount: "10" } })).rejects.toThrow("0%");
});