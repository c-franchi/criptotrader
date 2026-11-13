import { afterEach, expect, it, vi } from "vitest";
const archive = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("./marketHistoryArchive.server", () => ({
  getArchivedCandles: archive.read,
  saveArchiveCandles: archive.save,
}));
import { readCandles } from "./history.server";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("recovers newer durable bars during provider failure instead of returning stale process memory forever", async () => {
  vi.stubEnv("SUPABASE_URL", "");
  let now = 1800000000000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const old = [1799900100, 100, 101, 99, 100, 10];
  const newer = [1799999700, 68, 69, 67, 68, 10];
  archive.save.mockResolvedValue(undefined);
  archive.read.mockResolvedValue([newer]);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { attributes: { ohlcv_list: [old] } } }),
    })
    .mockRejectedValue(new Error("source offline"));
  vi.stubGlobal("fetch", fetcher);
  expect(await readCandles("pool-durable-recovery", "token", { fast: true })).toEqual([old]);
  now += 80000;
  expect(await readCandles("pool-durable-recovery", "token", { fast: true })).toEqual([old, newer]);
  expect(archive.read).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
