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
