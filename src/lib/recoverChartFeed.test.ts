import { afterEach, expect, it, vi } from "vitest";
import { recoverChartFeed } from "./recoverChartFeed";
import type { ChartFeed } from "./chartFeed.server";
const at = () => Math.floor(Date.now() / 300000) * 300;
const feed = (ts = at(), price = 68): ChartFeed => ({
  source: "gecko",
  candles: [[ts, price, price + 1, price - 1, price, 1]],
});
afterEach(() => vi.useRealTimers());
it("replaces the old server snapshot with current real pool candles", async () => {
  const old = feed(at() - 172800, 74),
    fresh = feed();
  const direct = vi.fn().mockResolvedValue(fresh);
  expect(await recoverChartFeed(async () => old, direct, old)).toMatchObject(fresh);
  expect(direct).toHaveBeenCalledOnce();
});
it("does not call the direct source when the server is recent", async () => {
  const direct = vi.fn();
  expect(await recoverChartFeed(async () => feed(), direct)).toMatchObject({
    refreshFailed: false,
  });
  expect(direct).not.toHaveBeenCalled();
});
it("recovers after the grace period without waiting for an unresponsive server", async () => {
  vi.useFakeTimers();
  const direct = vi.fn().mockResolvedValue(feed());
  const load = recoverChartFeed(() => new Promise(() => {}), direct);
  await vi.advanceTimersByTimeAsync(1500);
  expect(await load).toMatchObject({ refreshFailed: false });
  expect(direct).toHaveBeenCalledOnce();
});
it("keeps the best genuine candles when both transports fail", async () => {
  const saved = feed(at() - 172800, 74);
  expect(
    await recoverChartFeed(
      async () => {
        throw Error("server");
      },
      async () => {
        throw Error("browser");
      },
      saved,
    ),
  ).toMatchObject({ ...saved, refreshFailed: true });
});
it("does not replace newer local bars with an older server response", async () => {
  const saved = feed();
  expect(
    await recoverChartFeed(
      async () => feed(at() - 172800, 74),
      async () => feed(at() - 3600, 73),
      saved,
    ),
  ).toMatchObject(saved);
});
