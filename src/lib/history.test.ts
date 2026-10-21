import { afterEach, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      upsert: async (row: { pool: string; token: string; candles: unknown }) => {
        store.set(`${row.pool}:${row.token}`, row.candles);
        return {};
      },
      select: () => {
        const f: Record<string, string> = {};
        const q = {
          eq: (k: string, v: string) => {
            f[k] = v;
            return q;
          },
          maybeSingle: async () => ({
            data: store.has(`${f["pool"]}:${f["token"]}`)
              ? { candles: store.get(`${f["pool"]}:${f["token"]}`) }
              : null,
          }),
        };
        return q;
      },
    }),
  },
}));
import { readCandles } from "./history.server";

process.env["SUPABASE_URL"] ||= "http://test";
afterEach(() => vi.unstubAllGlobals());
const token = "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA";

it("coalesces concurrent reads and requests the selected token in five-minute intervals", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        attributes: {
          ohlcv_list: [
            [200, 2, 3, 1, 2],
            [100, 1, 2, 1, 1],
            [300, NaN, 1, 1, 1],
          ],
        },
      },
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const pool = "0x63123AD4B95B02f579c0c5649BA43379B64860A0";
  const [a, b] = await Promise.all([readCandles(pool, token), readCandles(pool, token)]);
  expect(a).toEqual([
    [100, 1, 2, 1, 1],
    [200, 2, 3, 1, 2],
  ]);
  expect(b).toEqual(a);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url = fetcher.mock.calls[0]?.[0] as URL;
  expect(url.searchParams.get("token")).toBe(token);
  expect(url.searchParams.get("aggregate")).toBe("5");
  await readCandles(pool, token);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("shows the last saved chart when the public source is down", async () => {
  const pool = "0x1111111111111111111111111111111111111111";
  store.set(`${pool}:${token.toLowerCase()}`, [[100, 1, 1, 1, 1]]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
  expect(await readCandles(pool, token)).toEqual([[100, 1, 1, 1, 1]]);
}, 10_000);
