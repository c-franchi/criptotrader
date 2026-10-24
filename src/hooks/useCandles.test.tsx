import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCandles } from "./useCandles";
const mocks = vi.hoisted(() => ({ latest: vi.fn(), older: vi.fn() }));
vi.mock("@/lib/history.functions", () => ({
  getCandles: mocks.latest,
  getCandleHistoryPage: mocks.older,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
it("loads an older visible range and preserves it after the next live refresh", async () => {
  mocks.latest.mockResolvedValue([[3600, 100, 101, 99, 100, 10]]);
  mocks.older.mockResolvedValue([[300, 90, 91, 89, 90, 10]]);
  const view = renderHook(() => useCandles("pool-a", "token-a"), { wrapper: setup() });
  await waitFor(() => expect(view.result.current.data).toHaveLength(1));
  await act(() => view.result.current.history.loadRange(300000, 600000));
  expect(view.result.current.data?.map((c) => c[0])).toEqual([300, 3600]);
  mocks.latest.mockResolvedValue([
    [3600, 100, 102, 99, 102, 12],
    [3900, 102, 103, 100, 103, 1],
  ]);
  await act(async () => {
    await view.result.current.refetch();
  });
  expect(view.result.current.data?.map((c) => c[0])).toEqual([300, 3600, 3900]);
  expect(view.result.current.data?.[1]?.[4]).toBe(102);
});
it("preserves candles on failure and allows an explicit retry instead of claiming history ended", async () => {
  mocks.latest.mockResolvedValue([[3600, 100, 101, 99, 100, 10]]);
  mocks.older
    .mockRejectedValueOnce(Error("429"))
    .mockResolvedValueOnce([[300, 90, 91, 89, 90, 10]]);
  const view = renderHook(() => useCandles("pool-error", "token"), { wrapper: setup() });
  await waitFor(() => expect(view.result.current.data).toHaveLength(1));
  await act(() => view.result.current.history.loadRange(300000, 600000));
  expect(view.result.current.history.error).toBeTruthy();
  expect(view.result.current.history.empty).toBe(false);
  expect(view.result.current.data).toHaveLength(1);
  await act(() => view.result.current.history.loadRange(300000, 600000, true));
  expect(view.result.current.data).toHaveLength(2);
  expect(view.result.current.history.error).toBeNull();
});
