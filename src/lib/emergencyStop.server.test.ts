import { expect, it, vi } from "vitest";
import { assertBotRunning, stopAllUserBots } from "./emergencyStop.server";

function fixture(failUpdate = false, failAudit = false) {
  const rows = [
    { id: "a", user_id: "me", wallet_scope: "one", armed: true, tokens: 12 },
    { id: "b", user_id: "me", wallet_scope: "two", armed: true, tokens: 7 },
    { id: "c", user_id: "other", wallet_scope: "three", armed: true, tokens: 4 },
    { id: "d", user_id: "me", wallet_scope: "one", armed: false, tokens: 3 },
  ];
  const tables: string[] = [];
  const audit = vi.fn(async () => ({ error: failAudit ? "offline" : null }));
  const admin = {
    from: (table: string) => {
      tables.push(table);
      const filters: [string, unknown][] = [];
      let patch: object = {};
      const q = {
        update: (value: object) => {
          patch = value;
          return q;
        },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return q;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const matches = rows.filter((row) =>
            filters.every(([k, v]) => row[k as keyof typeof row] === v),
          );
          if (!failUpdate) matches.forEach((row) => Object.assign(row, patch));
          return Promise.resolve(
            resolve({ error: failUpdate ? "offline" : null, count: matches.length }),
          );
        },
        insert: audit,
      };
      return q;
    },
  };
  return { admin, rows, tables, audit };
}

it("stops only the authenticated user's bots across all wallets, including held positions", async () => {
  const f = fixture();
  expect(await stopAllUserBots(f.admin, "me")).toEqual({ stopped: 2, auditRecorded: true });
  expect(f.rows.map((r) => r.armed)).toEqual([false, false, true, false]);
  expect(f.rows.map((r) => r.tokens)).toEqual([12, 7, 4, 3]);
  expect(f.tables).toEqual(["grid_bots", "audit_log"]);
  expect(await stopAllUserBots(f.admin, "me")).toEqual({ stopped: 0, auditRecorded: true });
});
it("reports a failed update without claiming success or writing audit", async () => {
  const f = fixture(true);
  await expect(stopAllUserBots(f.admin, "me")).rejects.toThrow("Não foi possível confirmar");
  expect(f.rows[0]!.armed).toBe(true);
  expect(f.audit).not.toHaveBeenCalled();
});
it("preserves a successful stop if audit is unavailable", async () => {
  const f = fixture(false, true);
  expect(await stopAllUserBots(f.admin, "me")).toEqual({ stopped: 2, auditRecorded: false });
  expect(f.rows[0]!.armed).toBe(false);
});
it("does not apply the bot guard to withdrawals", async () => {
  await assertBotRunning({}, "me");
});
