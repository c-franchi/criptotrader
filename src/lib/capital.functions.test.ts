import { beforeEach, expect, it, vi } from "vitest";
import { walletCapital } from "./walletCapital";
import { EMPTY_CONFIG } from "./strategy";
const io = vi.hoisted(() => ({
  scope: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  balance: vi.fn(),
  capital: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./walletScope.server", () => ({ assertWalletScope: io.scope }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: io.from } }));
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
import { getWalletCapital } from "./capital.functions";
const scope = "11111111-1111-4111-8111-111111111111";
const token = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
beforeEach(() => {
  vi.resetAllMocks();
  io.from.mockImplementation(() => {
    const q = {
      select: () => q,
      eq: io.eq,
      maybeSingle: async () => ({ data: { address: token }, error: null }),
    };
    io.eq.mockReturnValue(q);
    return q;
  });
  io.balance.mockResolvedValue(100000000000000000n);
  io.capital.mockResolvedValue(
    walletCapital("0.1", [
      {
        id: "own",
        token,
        armed: true,
        mode: "estrategia",
        order_bnb: 0,
        gas_reserve_bnb: 0,
        strat_state: { costBnb: 0.01 },
        config: { ...EMPTY_CONFIG, allocationBnb: 0.03, gasReserveBnb: 0.001 },
      },
    ]),
  );
});
it("keeps free balance distinct and scopes the reusable editing amount to the selected wallet/token", async () => {
  const result = await getWalletCapital({
    data: { walletScope: scope, editToken: token.toUpperCase().replace("0X", "0x") },
  });
  expect(result).toMatchObject({ free: "0.079", editAvailable: "0.1", invested: "0.01" });
  expect(io.scope).toHaveBeenCalledWith(expect.anything(), "owner", scope);
  expect(io.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(io.eq).toHaveBeenCalledWith("wallet_scope", scope);
  expect(io.capital).toHaveBeenCalledWith(expect.anything(), "owner", scope, "0.1", undefined);
  const normal = await getWalletCapital({ data: { walletScope: scope } });
  expect(normal?.editAvailable).toBe(normal?.free);
});
it("rejects a foreign wallet before querying balances or reservations", async () => {
  io.scope.mockRejectedValue(new Error("Carteira inválida"));
  await expect(
    getWalletCapital({ data: { walletScope: scope, editToken: token } }),
  ).rejects.toThrow("Carteira inválida");
  expect(io.balance).not.toHaveBeenCalled();
  expect(io.from).not.toHaveBeenCalled();
});
it("rejects malformed editing tokens before any reads", async () => {
  expect(() => getWalletCapital({ data: { walletScope: scope, editToken: "another" } })).toThrow();
  expect(io.scope).not.toHaveBeenCalled();
  expect(io.balance).not.toHaveBeenCalled();
});
