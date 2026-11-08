import { afterEach, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./history.server", () => ({ readCandles: mocked.read }));

import { fetchDexPaprikaChart, parseDexPaprikaCandles, readChartFeed } from "./chartFeed.server";

const POOL = "0x" + "a".repeat(40);
const TOKEN = "0x" + "b".repeat(40);
const nowBucket = () => Math.floor(Date.now() / 300000) * 300;
const altBar = (time: number, open = 2) => ({
  time_open: new Date(time * 1000).toISOString(),
  time_close: new Date((time + 300) * 1000 - 1).toISOString(),
  open,
  high: open + 1,
  low: open - 1,
  close: open,
  volume: 120,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("keeps fresh pool candles without contacting a paid alternative", async () => {
  vi.stubEnv("DEXPAPRIKA_API_KEY", "api_test");
  mocked.read.mockResolvedValue([[nowBucket() - 300, 2, 3, 1, 2, 20]]);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(readChartFeed(POOL, TOKEN)).resolves.toMatchObject({ source: "gecko" });
  expect(mocked.read).toHaveBeenCalledWith(POOL, TOKEN, { fast: true });
  expect(fetcher).not.toHaveBeenCalled();
});

it("reads true 5-minute USD token candles when pool history is stale and a paid source is configured", async () => {
  vi.stubEnv("DEXPAPRIKA_API_KEY", "api_test");
  mocked.read.mockResolvedValue([[nowBucket() - 3600, 2, 3, 1, 2, 20]]);
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [altBar(nowBucket() - 300, 4)],
  });
  vi.stubGlobal("fetch", fetcher);
  const feed = await readChartFeed(POOL, TOKEN);
  expect(feed).toEqual({ source: "dexpaprika", candles: [[nowBucket() - 300, 4, 5, 3, 4, 120]] });
  const [url, options] = fetcher.mock.calls[0] as [URL, RequestInit];
  expect(url.hostname).toBe("api-pro.dexpaprika.com");
  expect(url.pathname).toContain(TOKEN);
  expect(url.searchParams.get("interval")).toBe("5m");
  expect(options.headers).toMatchObject({ Authorization: "api_test" });
});

it("never invents missing candles or mixes an old or failed backup into the pool", async () => {
  vi.stubEnv("DEXPAPRIKA_API_KEY", "api_test");
  mocked.read.mockResolvedValue([[nowBucket() - 3600, 2, 3, 1, 2, 20]]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [altBar(nowBucket() - 3900, 4)],
  }));
  expect(await readChartFeed(POOL, TOKEN)).toMatchObject({ source: "gecko" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("429")));
  expect(await readChartFeed(POOL, TOKEN)).toMatchObject({ source: "gecko" });
});

it("rejects malformed and future bars without converting them to price samples", () => {
  const ts = nowBucket();
  expect(parseDexPaprikaCandles([
    altBar(ts - 300, 4),
    altBar(ts - 300, 0),
    altBar(ts + 3600, 4),
    { ...altBar(ts - 600, 4), high: 3 },
    { ...altBar(ts - 900, 4), volume: -50 },
    { ...altBar(ts - 1200, 4), time_open: "not-a-time" },
  ], ts)).toEqual([[ts - 300, 4, 5, 3, 4, 120]]);
});

it("does not attempt unauthorized alternative calls without the paid key", async () => {
  vi.stubEnv("DEXPAPRIKA_API_KEY", "");
  mocked.read.mockResolvedValue([[nowBucket() - 3600, 2, 3, 1, 2, 20]]);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await readChartFeed(POOL, TOKEN)).toMatchObject({ source: "gecko" });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(fetchDexPaprikaChart(TOKEN)).rejects.toThrow(/não configurada/);
});
