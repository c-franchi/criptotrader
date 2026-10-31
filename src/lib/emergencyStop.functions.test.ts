import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ middleware: vi.fn(), stop: vi.fn(), admin: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: mocks.middleware.mockImplementation(() => ({ handler: (fn: unknown) => fn })),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: "auth" }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: mocks.admin }));
vi.mock("./emergencyStop.server", () => ({ stopAllUserBots: mocks.stop }));
it("requires authentication and derives the target user exclusively from the verified session", async () => {
  const { stopAllBots } = await import("./emergencyStop.functions");
  mocks.stop.mockResolvedValue({ stopped: 2, auditRecorded: true });
  const handler = stopAllBots as unknown as (arg: unknown) => Promise<unknown>;
  expect(
    await handler({ context: { userId: "authenticated-user" }, data: { userId: "victim" } }),
  ).toEqual({ stopped: 2, auditRecorded: true });
  expect(mocks.middleware).toHaveBeenCalledWith(["auth"]);
  expect(mocks.stop).toHaveBeenCalledWith(mocks.admin, "authenticated-user");
});
