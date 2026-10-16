import { describe, expect, it } from "vitest";
import { alertState, shouldNotify, targetPrice } from "./alerts";

const rule = { direction: "queda" as const, basePrice: 0.0003, targetPct: 20, warnBeforePct: 2 };

describe("alertas de preço", () => {
  it("queda de 18% sobre 0,0003 avisa que está perto", () => {
    expect(alertState(rule, 0.0003 * 0.82)).toBe("perto");
  });
  it("queda de 10% ainda está longe", () => {
    expect(alertState(rule, 0.00027)).toBe("longe");
  });
  it("queda de 20% atingiu o ponto de compra", () => {
    expect(alertState(rule, 0.00024)).toBe("atingiu");
    expect(targetPrice(rule)).toBeCloseTo(0.00024, 10);
  });
  it("não repete o aviso no mesmo estado", () => {
    expect(shouldNotify("perto", "perto")).toBe(false);
    expect(shouldNotify("longe", "perto")).toBe(true);
    expect(shouldNotify("perto", "atingiu")).toBe(true);
  });
});
