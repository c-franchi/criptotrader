import { describe, it, expect } from "vitest";
import { recommendPreset } from "./recommend";

const flat = Array.from({ length: 30 }, (_, i) => 1 + (i % 2) * 0.03);
describe("recomendação de estratégia", () => {
  it("taxa 8%/8% recomenda Adaptativa", () => {
    expect(recommendPreset(Array.from({ length: 30 }, (_, i) => 1 + i * 0.005), { buy: 8, sell: 8 })?.id).toBe("adaptativa");
  });
  it("preço parado recomenda Adaptativa", () => {
    expect(recommendPreset(flat, { buy: 0, sell: 0 })?.id).toBe("adaptativa");
  });
  it("oscilação de 25% ou mais recomenda Entrada segura", () => {
    expect(recommendPreset([...flat, 1.4], { buy: 0, sell: 0 })?.id).toBe("segura");
  });
  it("alta sem taxa recomenda Ativa", () => {
    expect(recommendPreset(Array.from({ length: 30 }, (_, i) => 1 + i * 0.005), { buy: 0, sell: 0 })?.id).toBe("ativa");
  });
  it("sem histórico suficiente não recomenda", () => {
    expect(recommendPreset([1, 2, 3], { buy: 0, sell: 0 })).toBeNull();
  });
});
