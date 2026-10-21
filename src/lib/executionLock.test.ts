import { expect, it } from "vitest";
import { acquireExecution, releaseExecution } from "./executionLock.server";
it("wallet-wide atomic uniqueness blocks a second execution and owner mismatch cannot release it", async () => {
  const rows = new Map<string,string>();
  const admin = { from: () => ({ insert: async (r: {user_id:string;owner:string}) => { if(rows.has(r.user_id)) return {error:"duplicate"}; rows.set(r.user_id,r.owner); return {error:null}; }, delete: () => { const filters: Record<string,string>={}; const q = {eq:(k:string,v:string) => {filters[k]=v; return q;}, then:(resolve:(v:{error:null})=>void) => {if(rows.get(filters["user_id"] ?? "") === filters["owner"]) rows.delete(filters["user_id"] ?? ""); resolve({error:null});}}; return q; } }) };
  const owner = await acquireExecution(admin,"user");
  await expect(acquireExecution(admin,"user")).rejects.toThrow("Carteira em execução");
  await releaseExecution(admin,"user","wrong-owner"); expect(rows.size).toBe(1);
  await releaseExecution(admin,"user",owner); expect(rows.size).toBe(0);
});
import { canReleaseLock, reconcileLocks, STALE_LOCK_MS } from "./executionLock.server";
it("a lock younger than 15 minutes is never released", () => {
  expect(canReleaseLock(0, STALE_LOCK_MS - 1, [])).toBe(false);
  expect(canReleaseLock(0, STALE_LOCK_MS, [])).toBe(true);
});
it("a pending swap whose deadline has not passed keeps the lock", () => {
  const now = STALE_LOCK_MS + 1000;
  expect(canReleaseLock(0, now, [{ deadline: now / 1000, resolved: false }])).toBe(false);
});
it("RPC failure while checking a pending hash keeps the lock", async () => {
  const deleted: string[] = [];
  const q = (data: unknown) => { const o: Record<string, unknown> = { eq: () => o, select: () => o, update: () => o, insert: async () => ({ error: null }), then: (r: (v: unknown) => void) => r({ data, error: null }) }; return o; };
  const admin = { from: (t: string) => t === "bot_execution_locks"
    ? { select: async () => ({ data: [{ user_id: "u", owner: "o", acquired_at: new Date(0).toISOString() }] }), delete: () => { deleted.push("u"); return q(null); } }
    : q([{ id: "1", tx_hash: "0xabc", deadline: 0 }]) };
  const n = await reconcileLocks(admin, async () => { throw new Error("rpc down"); }, STALE_LOCK_MS * 10);
  expect(n).toBe(0); expect(deleted).toEqual([]);
});
