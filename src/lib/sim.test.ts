import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { simBuy, simSell, avgPrice } from "./sim";

const a = { dexFeePct: 0.25, slippagePct: 1, gasQuote: 0 };
const s0 = { quote: new Decimal(1), tokens: new Decimal(0), costBasis: new Decimal(0), realized: new Decimal(0), fees: new Decimal(0) };

describe("simulação", () => {
  it("compra aplica taxa de 0,25% e slippage de 1%", () => {
    const r = simBuy(s0, new Decimal("0.1"), new Decimal("0.001"), a);
    expect(r.tokens.toFixed(6)).toBe(new Decimal("0.09975").div("0.00101").toFixed(6));
    expect(r.next.quote.toString()).toBe("0.9");
  });
  it("venda de 50% vende metade do saldo remanescente", () => {
    const b = simBuy(s0, new Decimal("0.1"), new Decimal("0.001"), a).next;
    const r = simSell(b, new Decimal(50), new Decimal("0.001"), a);
    expect(r.next.tokens.toFixed(10)).toBe(b.tokens.div(2).toFixed(10));
    expect(r.next.costBasis.toString()).toBe("0.05");
  });
  it("não compra sem saldo", () => {
    expect(() => simBuy(s0, new Decimal(2), new Decimal(1), a)).toThrow();
  });
  it("preço médio indisponível sem posição", () => {
    expect(avgPrice(s0)).toBeNull();
  });
});
