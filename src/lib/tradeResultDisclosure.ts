import Decimal from "decimal.js";
import { KNOWN_TAX } from "./tokens";

/** Tax lookup is informative only; realized proceeds already reflect on-chain token tax. */
export function knownTokenTaxes(token: string) {
  return KNOWN_TAX[token.toLowerCase()] ?? null;
}

/** Current quote only: never a historical BRL settlement or verified on-chain proof. */
export function netBrlAtCurrentQuote(
  netBnb: string | number | null | undefined,
  bnbBrl: number | null | undefined,
): string | null {
  if (netBnb == null || bnbBrl == null || !Number.isFinite(bnbBrl) || bnbBrl <= 0)
    return null;
  try {
    const net = new Decimal(netBnb);
    if (!net.isFinite()) return null;
    return net.mul(bnbBrl).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return null;
  }
}
