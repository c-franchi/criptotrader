import { expect, it } from "vitest";
import { acquireExecution, releaseExecution } from "./executionLock.server";
it("wallet-wide atomic uniqueness blocks a second execution and owner mismatch cannot release it", async () => {
  const rows = new Map<string, string>();
  const admin = {
    rpc: async () => ({ data: false, error: null }),
    from: () => ({
      insert: async (r: { user_id: string; owner: string; wallet_scope: string }) => {
        const key = `${r.user_id}:${r.wallet_scope}`;
        if (rows.has(key)) return { error: "duplicate" };
        rows.set(key, r.owner);
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
            for (const [key, owner] of rows)
              if (key.startsWith(`${filters["user_id"]}:`) && owner === filters["owner"])
                rows.delete(key);
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
  const a = await acquireExecution(admin, "user", "wallet-a");
  const b = await acquireExecution(admin, "user", "wallet-b");
  expect(rows.size).toBe(2);
  await expect(acquireExecution(admin, "user", "wallet-a")).rejects.toThrow("Carteira em execução");
  await releaseExecution(admin, "user", a);
  expect(rows.size).toBe(1);
  await releaseExecution(admin, "user", b);
  expect(rows.size).toBe(0);
});
import { canReleaseLock, STALE_LOCK_MS } from "./executionLock.server";
it("age and an empty journal never prove a submission failed", () => {
  expect(canReleaseLock(0, STALE_LOCK_MS * 100, [])).toBe(false);
  expect(canReleaseLock(0, STALE_LOCK_MS * 100, [{ deadline: 0, resolved: false }])).toBe(false);
  expect(canReleaseLock(0, STALE_LOCK_MS, [{ deadline: 0, resolved: true }])).toBe(true);
});

import { recoverPreflightExecution } from "./executionLock.server";
it("uses the server-only scoped recovery and fails closed when its verification is unavailable", async () => {
  const calls: unknown[] = [];
  const admin = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  };
  expect(await recoverPreflightExecution(admin, "owner-user", "selected-wallet")).toBe(true);
  expect(calls).toEqual([
    {
      name: "recover_preflight_execution",
      args: { p_user: "owner-user", p_scope: "selected-wallet" },
    },
  ]);
  await expect(
    recoverPreflightExecution({ rpc: async () => ({ error: { message: "offline" } }) }, "u", "w"),
  ).rejects.toThrow("verificar a execução");
});
