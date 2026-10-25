import { expect, it, vi } from "vitest";
import { sharedRead, saveLivePool, loadLivePool } from "./sharedReads.server";
it("coalesces concurrent block reads but never reuses a failed request or a different block's reserves", async () => {
  const load = vi.fn(async () => 42);
  expect(
    await Promise.all([sharedRead("coalesced", 300, load), sharedRead("coalesced", 300, load)]),
  ).toEqual([42, 42]);
  expect(load).toHaveBeenCalledTimes(1);
  const fail = vi.fn().mockRejectedValueOnce(new Error("RPC")).mockResolvedValueOnce(43);
  await expect(sharedRead("failure", 300, fail)).rejects.toThrow("RPC");
  expect(await sharedRead("failure", 300, fail)).toBe(43);
  const pool = {
    pair: "0x1111111111111111111111111111111111111111" as const,
    tok: 10n,
    bnb: 5n,
    price: 0.5,
  };
  saveLivePool("token", "rpc", 1n, pool);
  expect(loadLivePool("token", "rpc", 1n)).toEqual(pool);
  expect(loadLivePool("token", "rpc", 2n)).toBeNull();
  expect(loadLivePool("another-token", "rpc", 1n)).toBeNull();
});
