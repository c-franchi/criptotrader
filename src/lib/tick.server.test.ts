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
        is: () => q,
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

import { BeforeBroadcastError } from "./executionPhase";
import { runGridStep } from "./bot.server";
it("releases proven pre-broadcast failures but retains unresolved earlier submissions", async () => {
  mocks.acquire.mockResolvedValue("owner");
  vi.mocked(runGridStep).mockRejectedValue(new BeforeBroadcastError("RPC unavailable before send"));
  const bot = { id: "b", user_id: "u", armed: true, mode: "grade" };
  for (const unresolved of [false, true]) {
    mocks.release.mockClear();
    const admin = {
      from: (table: string) => {
        const data =
          table === "execution_submissions" ? (unresolved ? [{ finished_at: null }] : []) : null;
        const q: any = {
          select: () => q,
          eq: () => q,
          is: () => q,
          update: () => q,
          maybeSingle: async () => ({
            data: table === "grid_bots" ? bot : { enc_key: "unused" },
            error: null,
          }),
          then: (resolve: any) => resolve({ data, error: null }),
        };
        return q;
      },
    };
    expect(await tickBot(admin, bot)).toMatchObject({
      ok: false,
      error: "RPC unavailable before send",
    });
    expect(mocks.release).toHaveBeenCalledTimes(unresolved ? 0 : 1);
  }
});
