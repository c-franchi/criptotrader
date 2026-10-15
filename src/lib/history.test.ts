import { afterEach, expect, it, vi } from "vitest";
import { readCandles } from "./history.server";

afterEach(() => vi.unstubAllGlobals());
it("coalesces concurrent reads and requests the selected token in five-minute intervals", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { attributes: { ohlcv_list: [[200, 2, 3, 1, 2], [100, 1, 2, 1, 1], [300, NaN, 1, 1, 1]] } } }) });
  vi.stubGlobal("fetch", fetcher);
  const token = "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA";
  const pool = "0x63123AD4B95B02f579c0c5649BA43379B64860A0";
  const [a, b] = await Promise.all([readCandles(pool, token), readCandles(pool, token)]);
  expect(a).toEqual([[100, 1, 2, 1, 1], [200, 2, 3, 1, 2]]);
  expect(b).toEqual(a);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url = fetcher.mock.calls[0]?.[0] as URL;
  expect(url.searchParams.get("token")).toBe(token);
  expect(url.searchParams.get("aggregate")).toBe("5");
  await readCandles(pool, token);
  expect(fetcher).toHaveBeenCalledTimes(1);
});