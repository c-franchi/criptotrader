import { expect, it } from "vitest";
import { fiatEstimate, fiatCurrency, formatFiat } from "./fiat";
const rates = { bnbUsd: 700, usdBrl: 5, usdEur: 0.9 };
it("converts the full available balance once, without subtracting positions twice", () => {
  expect(fiatEstimate("0.003920272", "BNB", "BRL", rates)).toBeCloseTo(13.720952);
  expect(fiatEstimate(1, "BNB", "USD", rates)).toBe(700);
  expect(fiatEstimate(1, "BNB", "EUR", rates)).toBe(630);
  expect(fiatEstimate(100, "USD", "BRL", rates)).toBe(500);
  expect(fiatEstimate(-1, "BNB", "USD", rates)).toBe(-700);
});
it("does not fabricate a conversion when rates or values are missing", () => {
  expect(fiatEstimate(1, "BNB", "BRL", null)).toBeNull();
  expect(fiatEstimate("bad", "USD", "USD", rates)).toBeNull();
  expect(fiatEstimate(1, "BNB", "EUR", { bnbUsd: 700, usdBrl: 5 })).toBeNull();
  expect(fiatEstimate(100, "USD", "USD", null)).toBe(100);
  expect(fiatCurrency("unknown")).toBe("BRL");
  expect(formatFiat(0.00035, "BRL")).toContain("0,00035");
});
