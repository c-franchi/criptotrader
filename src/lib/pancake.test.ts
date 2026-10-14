import { describe, it, expect } from "vitest";
import { minOut, priceImpactPct } from "./pancake";

describe("execução", () => {
  it("slippage de 1% reduz o mínimo recebido em 1%", () => {
    expect(minOut(10000n, 1)).toBe(9900n);
  });
  it("slippage de 0,5% usa inteiros", () => {
    expect(minOut(1_000_000_000_000_000_000n, 0.5)).toBe(995_000_000_000_000_000n);
  });
  it("impacto de preço com 1% da reserva ≈ 0,99%", () => {
    expect(priceImpactPct(1n * 10n ** 18n, 100n * 10n ** 18n)).toBeCloseTo(0.99, 2);
  });
  it("sem reserva o impacto é 100%", () => {
    expect(priceImpactPct(1n, 0n)).toBe(100);
  });
});
