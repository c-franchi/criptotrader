/* eslint-disable @typescript-eslint/no-explicit-any -- server query-chain test doubles */
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ acquire: vi.fn(), release: vi.fn() }));
vi.mock("./executionLock.server", () => ({
  acquireExecution: mocks.acquire,
  releaseExecution: mocks.release,
  reconcileLocks: vi.fn(),
}));
vi.mock("./submission.server", () => ({ reconcileSubmissions: vi.fn() }));
vi.mock("./bot.server", () => ({ runGridStep: vi.fn(), pubClient: () => ({}) }));
import { tickAll, tickBot } from "./tick.server";
it("reports blocked ticks as degraded and never claims the strategy was evaluated", async () => {
  mocks.acquire.mockRejectedValue(new Error("locked"));
  const updates: any[] = [];
  const bot = { id: "b", user_id: "u", armed: true };
  const admin = {
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        update: (patch: any) => {
          updates.push(patch);
          return q;
        },
        then: (resolve: any) => resolve({ data: [bot], error: null }),
      };
      return q;
    },
  };
  expect(await tickBot(admin, bot)).toMatchObject({ ok: false, blocked: true });
  expect(updates[0]).toEqual({ last_error: expect.stringMatching(/bloqueada/) });
  expect(mocks.release).not.toHaveBeenCalled();
  expect(await tickAll(admin)).toMatchObject({ ok: false, attempted: 1, evaluated: 0, blocked: 1 });
});
