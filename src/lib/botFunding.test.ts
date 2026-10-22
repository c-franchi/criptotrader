import { describe, expect, it } from "vitest";
import { missingBnb, requiredBotBnb } from "./botFunding";

describe("bot funding", () => {
  it("fixed size strategy needs reserve + buy amount", () => {
    expect(
      requiredBotBnb({ reserve: 0.005, sizingMode: "fixo", buyAmount: 0.01 }).total,
    ).toBeCloseTo(0.015);
  });
  it("percentage sizing does not invent a fixed minimum purchase", () => {
    expect(
      requiredBotBnb({ reserve: 0.005, sizingMode: "percentual", buyAmount: 50 }).total,
    ).toBeCloseTo(0.005);
  });
  it("R$12 (~0.0033 BNB) is not enough for a 0.005 reserve", () => {
    expect(missingBnb(0.006, 0, 0.0033)).toBeCloseTo(0.0027);
  });
  it("supports cent-sized fixed buys and an explicit zero reserve", () => {
    expect(requiredBotBnb({ reserve: 0, sizingMode: "fixo", buyAmount: 0.000001 }).total).toBe(
      0.000001,
    );
    expect(requiredBotBnb({ reserve: 0.00001, sizingMode: "percentual", buyAmount: 25 })).toEqual({
      reserve: 0.00001,
      trade: 0,
      total: 0.00001,
    });
  });
  it("enough balance means nothing missing", () => {
    expect(missingBnb(0.006, 0.003266, 0.003)).toBe(0);
  });
});
