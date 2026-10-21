import Decimal from "decimal.js";

export type SimState = {
  quote: Decimal;
  tokens: Decimal;
  costBasis: Decimal; // total quote spent on current tokens (incl. fees)
  realized: Decimal;
  fees: Decimal;
};

export type Assumptions = {
  dexFeePct: number;
  slippagePct: number;
  gasQuote: number;
  buyTaxPct?: number;
  sellTaxPct?: number;
};
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  dexFeePct: 0.25,
  slippagePct: 1,
  gasQuote: 0.0003,
};

/** Buy with `spend` quote at mid `price` (quote per token). */
export function simBuy(s: SimState, spend: Decimal, price: Decimal, a: Assumptions) {
  const total = spend.plus(a.gasQuote);
  if (total.gt(s.quote)) throw new Error("Saldo simulado insuficiente (incluindo gas)");
  const fee = spend.mul(a.dexFeePct).div(100);
  const execPrice = price.mul(1 + a.slippagePct / 100);
  const tokens = spend
    .minus(fee)
    .mul(1 - (a.buyTaxPct ?? 0) / 100)
    .div(execPrice);
  return {
    next: {
      quote: s.quote.minus(total),
      tokens: s.tokens.plus(tokens),
      costBasis: s.costBasis.plus(total),
      realized: s.realized,
      fees: s.fees.plus(fee).plus(a.gasQuote),
    },
    tokens,
    fee,
    realized: new Decimal(0),
  };
}

/** Sell `pct`% of the remaining position at mid `price`. */
export function simSell(s: SimState, pct: Decimal, price: Decimal, a: Assumptions) {
  if (s.tokens.lte(0)) throw new Error("Sem posição simulada");
  const tokens = s.tokens.mul(pct).div(100);
  const execPrice = price.mul(1 - a.slippagePct / 100);
  const gross = tokens.mul(execPrice);
  const fee = gross.mul(a.dexFeePct).div(100);
  const proceeds = gross
    .minus(fee)
    .mul(1 - (a.sellTaxPct ?? 0) / 100)
    .minus(a.gasQuote);
  if (s.quote.plus(proceeds).lt(0)) throw new Error("Saldo insuficiente para o gás simulado");
  const basisPart = s.costBasis.mul(pct).div(100);
  const realized = proceeds.minus(basisPart);
  return {
    next: {
      quote: s.quote.plus(proceeds),
      tokens: s.tokens.minus(tokens),
      costBasis: s.costBasis.minus(basisPart),
      realized: s.realized.plus(realized),
      fees: s.fees.plus(fee).plus(a.gasQuote),
    },
    tokens,
    fee,
    proceeds,
    realized,
  };
}

export function avgPrice(s: SimState): Decimal | null {
  return s.tokens.gt(0) ? s.costBasis.div(s.tokens) : null;
}
