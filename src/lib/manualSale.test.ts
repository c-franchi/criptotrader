import { expect, it } from "vitest";
import {
  compactTokenAmount,
  enforceManualImpact,
  percentageAmount,
  readManualLimits,
  tokenAmount,
} from "./manualSale";

it("parses a Brazilian decimal without losing one token unit", () => {
  expect(tokenAmount("123456789012345678,123456789012345678", 18)).toBe(
    123456789012345678123456789012345678n,
  );
  expect(tokenAmount("0,000000000000000001", 18)).toBe(1n);
});
it("rejects nonpositive amounts and amounts exceeding balance", () => {
  expect(() => tokenAmount("0", 18)).toThrow();
  expect(() => tokenAmount("-1", 18)).toThrow();
  expect(() => tokenAmount("1,01", 2, 100n)).toThrow();
});
it("rejects unsupported decimals instead of rounding into a different quantity", () => {
  expect(() => tokenAmount("0,001", 2)).toThrow();
  expect(() => tokenAmount("1,2,3", 18)).toThrow();
});
it.each([25, 50, 75, 100])("selects exact %s percent and never exceeds balance", (pct) => {
  const balance = 123456789012345678901234567n;
  expect(percentageAmount(balance, pct)).toBe((balance * BigInt(pct)) / 100n);
});
it("shortens display without losing the underlying maximum quantity", () => {
  const raw = 123456789123456789123456789n;
  expect(compactTokenAmount(raw, 18)).toBe("123456789,123456");
  expect(percentageAmount(raw, 100)).toBe(raw);
  expect(compactTokenAmount(1n, 18)).toBe("0,000000000000000001");
});
it("treats missing limits as undefined, never as zero or defaults", () => {
  for (const value of [
    undefined,
    null,
    {},
    { maxPriceImpactPct: null, maxSlippagePct: 1 },
    { maxSlippagePct: 1 },
  ])
    expect(readManualLimits(value)).toBeNull();
  expect(() => enforceManualImpact(1.08, null)).toThrow("Defina");
});
it("preserves an explicit zero and blocks 1.08 percent, independently of slippage", () => {
  const limits = readManualLimits({ maxPriceImpactPct: 0, maxSlippagePct: 7 });
  expect(limits?.maxPriceImpactPct).toBe(0);
  expect(() => enforceManualImpact(1.08, limits)).toThrow("1,08%");
  expect(() => enforceManualImpact(1.08, limits)).toThrow("0%");
});
it("accepts the valid configured impact without widening it", () => {
  const limits = { maxPriceImpactPct: 2, maxSlippagePct: 1 };
  expect(enforceManualImpact(1.08, limits)).toEqual(limits);
  expect(() => enforceManualImpact(2.01, limits)).toThrow();
});
it("allows only the existing zero-to-twenty safety range", () => {
  expect(readManualLimits({ maxPriceImpactPct: 20, maxSlippagePct: 20 })).not.toBeNull();
  expect(readManualLimits({ maxPriceImpactPct: 20.01, maxSlippagePct: 1 })).toBeNull();
  expect(readManualLimits({ maxPriceImpactPct: 1, maxSlippagePct: -1 })).toBeNull();
});
