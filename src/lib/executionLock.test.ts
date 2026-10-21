import { expect, it } from "vitest";
import { acquireExecution, releaseExecution } from "./executionLock.server";
it("wallet-wide atomic uniqueness blocks a second execution and owner mismatch cannot release it", async () => {
  const rows = new Map<string, string>();
  const admin = {
    from: () => ({
      insert: async (r: { user_id: string; owner: string }) => {
        if (rows.has(r.user_id)) return { error: "duplicate" };
        rows.set(r.user_id, r.owner);
        return { error: null };
      },
      delete: () => {
        const filters: Record<string, string> = {};
        const q = {
          eq: (k: string, v: string) => {
            filters[k] = v;
            return q;
          },
          then: (resolve: (v: { error: null }) => void) => {
            if (rows.get(filters["user_id"] ?? "") === filters["owner"])
              rows.delete(filters["user_id"] ?? "");
            resolve({ error: null });
          },
        };
        return q;
      },
    }),
  };
  const owner = await acquireExecution(admin, "user");
  await expect(acquireExecution(admin, "user")).rejects.toThrow("Carteira em execução");
  await releaseExecution(admin, "user", "wrong-owner");
  expect(rows.size).toBe(1);
  await releaseExecution(admin, "user", owner);
  expect(rows.size).toBe(0);
});
import { canReleaseLock, STALE_LOCK_MS } from "./executionLock.server";
it("age and an empty journal never prove a submission failed", () => {
  expect(canReleaseLock(0, STALE_LOCK_MS * 100, [])).toBe(false);
  expect(canReleaseLock(0, STALE_LOCK_MS * 100, [{ deadline: 0, resolved: false }])).toBe(false);
  expect(canReleaseLock(0, STALE_LOCK_MS, [{ deadline: 0, resolved: true }])).toBe(true);
});
