import { describe, expect, it } from "vitest";
import { computePnl, rebuyEdgePct } from "./pnl";

describe("computePnl", () => {
  it("buy 1 BNB → 1000 tokens, sell 500 for 0.6 BNB = +0.1 BNB realized", () => {
    const p = computePnl([
      { side: "compra", bnb: 1, tokens: 1000, at: "2026-01-01" },
      { side: "venda", bnb: 0.6, tokens: 500, at: "2026-01-02" },
    ]);
    expect(p.realized).toBeCloseTo(0.1);
    expect(p.position).toBe(500);
    expect(p.avgCost).toBeCloseTo(0.001);
  });
  it("selling tokens never bought here does not invent profit", () => {
    expect(computePnl([{ side: "venda", bnb: 1, tokens: 100, at: "x" }]).realized).toBe(0);
  });
});

describe("rebuyEdgePct", () => {
  it("sold 1000 tokens for 1 BNB, now 1 BNB buys 1100 → +10% more tokens", () => {
    expect(rebuyEdgePct({ side: "venda", bnb: 1, tokens: 1000, at: "x" }, 1, 1100)).toBeCloseTo(10);
  });
});
