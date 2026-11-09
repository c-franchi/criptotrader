import { expect, it } from "vitest";
import { formatDistancePct, formatUsd } from "./display";
it("never rounds an unmet positive trigger distance to zero", () => {
  expect(formatDistancePct(0.01818)).toBe("0,018%");
  expect(formatDistancePct(0.00001)).toBe("< 0,001%");
  expect(formatDistancePct(0)).toBe("0%");
  expect(formatUsd(81649.14)).toBe("US$ 81.649,14");
});

it("keeps ten significant digits for tiny quotes instead of rounding them to cents", async () => {
  const { formatQuote } = await import("./display");
  expect(formatQuote(0.000144250123456)).toBe("0,0001442501235");
  expect(formatQuote(NaN)).toBe("—");
});
