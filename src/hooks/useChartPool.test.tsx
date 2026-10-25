import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pools: [] as { pairAddress: string; supported: boolean }[] }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { pools: state.pools } }) }));
vi.mock("@/lib/chain.functions", () => ({ getMarket: vi.fn() }));
import { useChartPool } from "./useChartPool";
afterEach(() => {
  cleanup();
  localStorage.clear();
  state.pools = [];
});
it("keeps the historical pool across live quote failures without exposing a fallback execution price", () => {
  state.pools = [{ pairAddress: "0x" + "2".repeat(40), supported: true }];
  const hook = renderHook(() => useChartPool("token", undefined));
  expect(hook.result.current).toBe(state.pools[0]!.pairAddress);
  state.pools = [];
  hook.rerender();
  expect(hook.result.current).toBe("0x" + "2".repeat(40));
});
it("restores the last pool for historical display after a reload and never borrows another token's pool", async () => {
  localStorage.setItem("cryptobot:chart-pool:a", "0x" + "3".repeat(40));
  const hook = renderHook(({ token }) => useChartPool(token, undefined), {
    initialProps: { token: "a" },
  });
  await waitFor(() => expect(hook.result.current).toBe("0x" + "3".repeat(40)));
  hook.rerender({ token: "b" });
  expect(hook.result.current).toBeUndefined();
});
