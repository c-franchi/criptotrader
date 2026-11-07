import { expect, it } from "vitest";
import { knownTokenTaxes, netBrlAtCurrentQuote } from "./tradeResultDisclosure";

const GTE = "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA";

it("discloses both known GTE token taxes but does not subtract them again", () => {
  expect(knownTokenTaxes(GTE)).toEqual({ buy: 8, sell: 8 });
  expect(knownTokenTaxes("0x0000000000000000000000000000000000001234")).toBeNull();
});

it("converts a demonstrative BNB net to current BRL without changing the on-chain amount", () => {
  const netBnb = "0.001939651231919775";
  expect(netBrlAtCurrentQuote(netBnb, 3814.88)).toBe("7.40");
  expect(netBnb).toBe("0.001939651231919775");
  expect(netBrlAtCurrentQuote("-0.0007", 3814.88)).toBe("-2.67");
  expect(netBrlAtCurrentQuote("0", 3814.88)).toBe("0.00");
});

it("never fabricates a result when actual native proceeds or FX are unavailable", () => {
  expect(netBrlAtCurrentQuote(null, 3814.88)).toBeNull();
  expect(netBrlAtCurrentQuote("0.005", null)).toBeNull();
  expect(netBrlAtCurrentQuote("0.005", 0)).toBeNull();
  expect(netBrlAtCurrentQuote("not-a-number", 3814.88)).toBeNull();
});
