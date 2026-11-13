import { afterEach, expect, it, vi } from "vitest";
import btc from "@/test/fixtures/btcb-ohlcv-20261113.json";
import gte from "@/test/fixtures/gte-ohlcv-20261113.json";
import { parseBrowserCandles } from "./browserCandles";
const token = "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c";
const pool = "0x61eb789d75a95caa3ff50ed7e47b96c132fec082";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  [btc, token],
  [gte, "0xa229c797c8e6a275cf5ee4cda37f5e619f15affa"],
])(
  "parses real public OHLCV captured on Nov 13 instead of the stale Nov 11 snapshot",
  (data, address) => {
    const candles = parseBrowserCandles(data, address, Date.UTC(2026, 10, 13, 15));
    expect(candles).toHaveLength(36);
    expect(candles.at(-1)![0]).toBeGreaterThan(Date.UTC(2026, 10, 13, 14) / 1000);
    expect(candles.at(-1)![4]).toBe(data.data.attributes.ohlcv_list[0]![4]);
  },
);
it("refuses another token, invalid OHLC and future dates without synthesizing bars", () => {
  expect(() => parseBrowserCandles(gte, token)).toThrow(/token selecionado/);
  const row = btc.data.attributes.ohlcv_list[0]!;
  const make = (rows: unknown[]) => ({ data: { attributes: { ohlcv_list: rows } } });
  const now = row[0]! * 1000;
  expect(
    parseBrowserCandles(
      make([
        [row[0]! + 300, 1, 2, 0.5, 1, 1],
        [row[0], 10, 5, 1, 10, 1],
        [row[0], 1, 2, 0.5, 1, -1],
      ]),
      token,
      now,
    ),
  ).toEqual([]);
});
it("coalesces public requests, sends no credentials and reuses the minute cache", async () => {
  vi.resetModules();
  const { readBrowserCandles } = await import("./browserCandles");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => btc });
  vi.stubGlobal("fetch", fetcher);
  const [a, b] = await Promise.all([
    readBrowserCandles(pool, token),
    readBrowserCandles(pool.toUpperCase().replace("0X", "0x"), token),
  ]);
  expect(a).toEqual(b);
  await readBrowserCandles(pool, token);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, options] = fetcher.mock.calls[0]!;
  expect(url.hostname).toBe("api.geckoterminal.com");
  expect(url.searchParams.get("token")).toBe(token);
  expect(options).toMatchObject({ credentials: "omit", mode: "cors" });
  expect(options.headers).toBeUndefined();
});
it("respects 429 backoff across charts rather than retrying per component", async () => {
  vi.resetModules();
  const { readBrowserCandles } = await import("./browserCandles");
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: false, status: 429, headers: new Headers({ "retry-after": "120" }) });
  vi.stubGlobal("fetch", fetcher);
  await expect(readBrowserCandles(pool, token)).rejects.toThrow(/429/);
  await expect(readBrowserCandles("0x" + "a".repeat(40), token)).rejects.toThrow(/Aguardando/);
  expect(fetcher).toHaveBeenCalledOnce();
});
