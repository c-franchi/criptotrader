import { expect, it } from "vitest";
import { strategySchema } from "./strategyValidation";
import { EMPTY_CONFIG } from "./strategy";
it("rejects malformed financial limits independently of the UI", () => {
  expect(strategySchema.safeParse(EMPTY_CONFIG).success).toBe(true);
  for (const bad of [
    { buyAmount: Infinity },
    { maxSlippagePct: -1 },
    { maxSlippagePct: 99 },
    { buyTaxPct: 100 },
    { maFast: 30, maSlow: 21 },
    { maxEntries: 1.5 },
    { sizingMode: "percentual", buyAmount: 101 },
  ])
    expect(strategySchema.safeParse({ ...EMPTY_CONFIG, ...bad }).success).toBe(false);
});
