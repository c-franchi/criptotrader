import { describe, expect, it } from "vitest";
import type { Candle } from "./marketStats";
import { latestCandleViewport } from "./chartViewport";

const NOW = 1_800_000_000_000;
const mark = (ms: number): Candle => [Math.floor(ms / 300_000) * 300, 2, 3, 1, 2, 10];

describe("last verified chart candle viewport", () => {
  it("opens an hour window next to an old last bar rather than an empty present", () => {
    const last = mark(NOW - 8 * 3_600_000);
    const view = latestCandleViewport([last], NOW, 1, 15);
    expect(last[0] * 1000).toBeGreaterThan(view.start);
    expect(last[0] * 1000).toBeLessThan(view.end);
    expect(view.end - last[0] * 1000).toBeLessThan(30 * 60_000);
    expect(view.end).toBeLessThan(NOW - 7 * 3_600_000);
    expect(view.end - view.start).toBe(3_600_000);
  });

  it("follows newer verified bars, even if new data arrive in a different order", () => {
    const older = mark(NOW - 10 * 3_600_000);
    const latest = mark(NOW - 8 * 3_600_000);
    const prior = latestCandleViewport([older], NOW, 4, 5);
    const next = latestCandleViewport([latest, older], NOW, 4, 5);
    expect(next.end).toBeGreaterThan(prior.end);
    expect(next.end - next.start).toBe(4 * 3_600_000);
    expect(latest[0] * 1000).toBeGreaterThan(next.start);
    expect(latest[0] * 1000).toBeLessThan(next.end);
  });

  it("preserves the selected window and does not invent bars or treat a future bar as verified", () => {
    const future = mark(NOW + 3_600_000);
    const baseline = { start: NOW - 24 * 3_600_000, end: NOW };
    expect(latestCandleViewport([], NOW, 24, 30)).toEqual(baseline);
    expect(latestCandleViewport([future], NOW, 24, 30)).toEqual(baseline);
    const past = mark(NOW - 12 * 3_600_000);
    const view = latestCandleViewport([past], NOW, 24, 30);
    expect(view.end - view.start).toBe(24 * 3_600_000);
    expect(view.end).toBeLessThan(NOW);
  });

  it("shows the current time normally when the newest candle is actually recent", () => {
    const latest = mark(NOW - 5 * 60_000);
    const view = latestCandleViewport([latest], NOW, 1, 5);
    expect(view.end).toBe(NOW);
  });
});
