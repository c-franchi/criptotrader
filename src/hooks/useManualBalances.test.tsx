import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useManualBalances } from "./useManualBalances";
afterEach(cleanup);
it("reads the selected address before any signing wallet is connected", async () => {
  const read = vi.fn().mockResolvedValue({ bnb: 100n, gte: 1200n });
  const hook = renderHook(() => useManualBalances("wallet-a", "token", read));
  await waitFor(() => expect(hook.result.current.balance?.gte).toBe(1200n));
  expect(read).toHaveBeenCalledWith("wallet-a", "token");
});
it("hides old balances immediately and ignores late responses after a wallet/token switch", async () => {
  let resolve!: (value: { bnb: bigint; gte: bigint }) => void;
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ bnb: 2n, gte: 20n });
  const hook = renderHook(({ address, token }) => useManualBalances(address, token, read), {
    initialProps: { address: "a", token: "one" },
  });
  hook.rerender({ address: "b", token: "two" });
  await waitFor(() => expect(hook.result.current.balance?.gte).toBe(20n));
  await act(async () => {
    resolve({ bnb: 1n, gte: 999n });
  });
  expect(hook.result.current.balance?.gte).toBe(20n);
});
it("represents a failed query as unavailable, never as zero or a retained spendable balance", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ bnb: 1n, gte: 30n })
    .mockRejectedValue(new Error("RPC unavailable"));
  const hook = renderHook(() => useManualBalances("a", "token", read));
  await waitFor(() => expect(hook.result.current.balance?.gte).toBe(30n));
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.balance).toBeNull();
  expect(hook.result.current.error).toBe(true);
});
