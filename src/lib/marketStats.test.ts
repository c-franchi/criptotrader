import { expect, it } from "vitest";
import { windowStats } from "./marketStats";
it("reports real candle variation and extrema without a hypothetical investment", () => {
  expect(windowStats([])).toBeNull();
  expect(
    windowStats([
      [0, 100, 110, 90, 105],
      [300, 105, 120, 95, 110],
    ]),
  ).toMatchObject({ open: 100, close: 110, high: 120, low: 90 });
});
