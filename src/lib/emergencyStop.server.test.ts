import { expect, it, vi } from "vitest";
import { stopAllUserBots } from "./emergencyStop.server";

function fixture(fail = false, failAudit = false) {
  const bots = [
    { id: "a", user_id: "me", wallet_scope: "one", armed: true, strat_state: { tokens: 9 } },
    { id: "b", user_id: "me", wallet_scope: "two", armed: true, strat_state: { tokens: 3 } },
    { id: "c", user_id: "other", wallet_scope: "three", armed: true, strat_state: {} },
    { id: "d", user_id: "me", wallet_scope: "one", armed: false, strat_state: {} },
  ];
  let patch = {};
  const filters: [string, unknown][] = [];
  const insert = vi.fn(async () => ({ error: failAudit ? "audit offline" : null }));
  const query = {
    update: vi.fn((value) => {
      patch = value;
      return query;
    }),
    eq: vi.fn((key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    }),
    select: vi.fn(async () => {
      if (fail) return { data: null, error: "offline" };
      const affected = bots.filter((b) => filters.every(([k, v]) => b[k as keyof typeof b] === v));
      for (const b of affected) Object.assign(b, patch);
      return { data: affected.map(({ id, wallet_scope }) => ({ id, wallet_scope })), error: null };
    }),
  };
  const from = vi.fn((table: string) => {
    if (table === "grid_bots") return query;
    if (table === "audit_log") return { insert };
    throw new Error(`Unexpected mutation: ${table}`);
  });
  return { admin: { from }, bots, query, insert };
}
it("stops all of the authenticated user's wallets despite open positions, preserving assets and other users", async () => {
  const f = fixture();
  expect(await stopAllUserBots(f.admin, "me")).toEqual({ stopped: 2, auditSaved: true });
  expect(f.bots.map((b) => b.armed)).toEqual([false, false, true, false]);
  expect(f.bots[0]!.strat_state).toEqual({ tokens: 9 });
  expect(f.bots[1]!.strat_state).toEqual({ tokens: 3 });
  expect(f.query.update).toHaveBeenCalledWith({ armed: false, updated_at: expect.any(String) });
  expect(f.admin.from.mock.calls.map(([table]) => table)).toEqual(["grid_bots", "audit_log"]);
  expect(f.insert).toHaveBeenCalledWith(
    expect.objectContaining({ user_id: "me", action: "bots_emergency_stopped" }),
  );
});
it("reports storage failure without claiming bots stopped", async () => {
  const f = fixture(true);
  await expect(stopAllUserBots(f.admin, "me")).rejects.toThrow("Não foi possível confirmar");
  expect(f.insert).not.toHaveBeenCalled();
});
it("reports audit failure without undoing the stop", async () => {
  const f = fixture(false, true);
  expect(await stopAllUserBots(f.admin, "me")).toEqual({ stopped: 2, auditSaved: false });
  expect(f.bots[0]!.armed).toBe(false);
});
