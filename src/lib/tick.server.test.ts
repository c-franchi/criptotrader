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
        gte: () => q,
        limit: () => q,
        is: () => q,
        order: () => q,
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
  const bot = {
    id: "b",
    user_id: "u",
    armed: true,
    mode: "grade",
    token: "0x1111111111111111111111111111111111111111",
  };
  for (const unresolved of [false, true]) {
    mocks.release.mockClear();
    const admin = {
      from: (table: string) => {
        const data =
          table === "execution_submissions" ? (unresolved ? [{ finished_at: null }] : []) : null;
        const q: any = {
          select: () => q,
          insert: async () => ({ error: null }),
          eq: () => q,
          gte: () => q,
          limit: () => q,
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

it("notifies a new inability to operate once, retaining the bot configuration and not resending orders", async () => {
  mocks.acquire.mockResolvedValue("owner");
  vi.mocked(runGridStep).mockResolvedValue({
    patch: { last_error: "Moeda incompatível com compra em BNB" },
    order: null,
  });
  const bot: any = {
    id: "b",
    user_id: "u",
    armed: true,
    mode: "grade",
    token: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    last_error: null,
  };
  const notices: any[] = [];
  const admin = {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        limit: () => q,
        insert: async (row: any) => {
          if (table === "notifications") notices.push(row);
          return { error: null };
        },
        update: (patch: any) => {
          Object.assign(bot, patch);
          return q;
        },
        maybeSingle: async () => ({
          data: table === "grid_bots" ? bot : { enc_key: "unused" },
          error: null,
        }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return q;
    },
  };
  await tickBot(admin, bot);
  await tickBot(admin, bot);
  expect(notices).toHaveLength(1);
  expect(notices[0].title).toMatch(/WBNB/);
  expect(bot.armed).toBe(true);
});
