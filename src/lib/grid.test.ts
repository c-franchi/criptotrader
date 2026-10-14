import { describe, expect, it } from "vitest";
import { gridDecision, gridLevel } from "./grid";

describe("grade", () => {
  it("calcula a faixa e limita aos extremos", () => {
    expect(gridLevel(1.5, 1, 2, 10)).toBe(5);
    expect(gridLevel(0.5, 1, 2, 10)).toBe(0);
    expect(gridLevel(3, 1, 2, 10)).toBe(9);
  });
  it("primeira execução não opera", () => {
    expect(gridDecision(1.5, 1, 2, 10, null).action).toBe("nenhuma");
  });
  it("queda de 2 faixas compra 2 ordens", () => {
    expect(gridDecision(1.35, 1, 2, 10, 5)).toEqual({ level: 3, action: "compra", steps: 2 });
  });
  it("alta de 1 faixa vende 1 ordem", () => {
    expect(gridDecision(1.65, 1, 2, 10, 5)).toEqual({ level: 6, action: "venda", steps: 1 });
  });
});
