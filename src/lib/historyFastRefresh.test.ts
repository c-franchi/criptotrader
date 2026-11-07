import { afterEach, expect, it, vi } from "vitest";
import { fetchGecko } from "./history.server";

const POOL = "0x" + "a".repeat(40);
const TOKEN = "0x" + "b".repeat(40);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("gives background OHLCV one bounded, realistic chance before fallback", async () => {
  const signal = new AbortController().signal;
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { attributes: { ohlcv_list: [[300, 2, 3, 1, 2, 10]] } } }),
  });
  vi.stubGlobal("fetch", fetcher);

  await expect(fetchGecko(POOL, TOKEN, true)).resolves.toEqual([[300, 2, 3, 1, 2, 10]]);
  expect(timeout).toHaveBeenCalledWith(6_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1].signal).toBe(signal);
});
