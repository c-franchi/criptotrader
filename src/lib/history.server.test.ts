import { afterEach, expect, it, vi } from "vitest";
import { readCandles } from "./history.server";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("keeps robot history independent of a stalled chart request, bounded to one short attempt", async () => {
  vi.stubEnv("SUPABASE_URL", "");
  let finishChart!: (value: unknown) => void;
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishChart = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error("provider unavailable"));
  vi.stubGlobal("fetch", fetcher);
  const chart = readCandles("pool-independent", "token");
  await expect(readCandles("pool-independent", "token", { fast: true })).rejects.toThrow(
    /Histórico|histórico/,
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([8000, 1500]);
  finishChart({
    ok: true,
    json: async () => ({ data: { attributes: { ohlcv_list: [[100, 10, 11, 9, 10, 1]] } } }),
  });
  expect(await chart).toEqual([[100, 10, 11, 9, 10, 1]]);
  // A failed fast refresh never discards genuine candles obtained by the chart.
  expect(await readCandles("pool-independent", "token", { fast: true })).toEqual([
    [100, 10, 11, 9, 10, 1],
  ]);
});

it("paginates historical OHLCV by seconds without contaminating the live robot cache", async () => {
  vi.stubEnv("SUPABASE_URL", "");
  const { readCandleHistoryPage } = await import("./history.server");
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { attributes: { ohlcv_list: [[3000, 10, 11, 9, 10, 1]] } } }),
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await readCandleHistoryPage("pool-old-page", "token", 6000)).toHaveLength(1);
  const url = new URL(String(fetcher.mock.calls[0]?.[0]));
  expect(url.searchParams.get("before_timestamp")).toBe("6000");
  expect(url.searchParams.get("limit")).toBe("1000");
  await readCandleHistoryPage("pool-old-page", "token", 6000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await readCandles("pool-old-page", "token", { fast: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams.has("before_timestamp")).toBe(
    false,
  );
});
it("keeps an exhausted page distinct from provider failure", async () => {
  const { readCandleHistoryPage } = await import("./history.server");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attributes: { ohlcv_list: [] } } }),
      })
      .mockResolvedValueOnce({ ok: false, status: 429 }),
  );
  expect(await readCandleHistoryPage("pool-empty-page", "token", 6000)).toEqual([]);
  await expect(readCandleHistoryPage("pool-error-page", "token", 6000)).rejects.toThrow("429");
});
