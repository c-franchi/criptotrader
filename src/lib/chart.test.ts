import { expect, it } from "vitest";
import { chartWindow } from "./chart";

it("does not move the requested hour to the last old trade", () => {
  const result = chartWindow([[100, 1, 1, 1, 1]], 10_000_000, 3_600_000);
  expect(result.visible).toEqual([]);
});
it("uses opening price and reports partial history without a full-hour percentage", () => {
  const result = chartWindow([[9500, 2, 4, 2, 3]], 10_000_000, 3_600_000);
  expect(result.baseline).toBe(2);
  expect(result.covered).toBe(false);
});
it("uses the price immediately before the interval as baseline", () => {
  const result = chartWindow([[6300, 1, 1, 1, 1], [6500, 2, 2, 2, 2]], 10_000_000, 3_600_000);
  expect(result.baseline).toBe(1);
  expect(result.covered).toBe(true);
});
