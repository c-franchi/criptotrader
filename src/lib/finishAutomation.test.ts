import { expect, it, vi } from "vitest";
import { finishAutomationKeepingAssets } from "./finishAutomation";
import type { SupabaseClient } from "@supabase/supabase-js";
it("only disarms the selected wallet bot and preserves its open position and execution journal", async () => {
  const position = { tokens: 2, costBnb: 0.01, avgPriceUsd: 100 };
  const bot = { armed: true, strat_state: position };
  const filters: unknown[] = [];
  const update = vi.fn((patch: object) => {
    Object.assign(bot, patch);
    return q;
  });
  const q = {
    update,
    eq: (key: string, value: string) => {
      filters.push([key, value]);
      return q;
    },
    select: () => q,
    maybeSingle: async () => ({ data: { id: "b" }, error: null }),
  };
  const from = vi.fn((table: string) =>
    table === "grid_bots" ? q : { insert: async () => ({ error: null }) },
  );
  await finishAutomationKeepingAssets({ from } as unknown as SupabaseClient, "u", "s", "b");
  expect(update).toHaveBeenCalledWith({ armed: false, updated_at: expect.any(String) });
  expect(filters).toEqual([
    ["id", "b"],
    ["user_id", "u"],
    ["wallet_scope", "s"],
  ]);
  expect(bot.strat_state).toBe(position);
  expect(from.mock.calls.map(([table]) => table)).toEqual(["grid_bots", "audit_log"]);
});
it("does not claim success when the selected bot was not updated", async () => {
  const q = {
    update: () => q,
    eq: () => q,
    select: () => q,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  await expect(
    finishAutomationKeepingAssets({ from: () => q } as unknown as SupabaseClient, "u", "s", "b"),
  ).rejects.toThrow(/Não foi possível/);
});
