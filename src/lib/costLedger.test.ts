import { expect, it } from "vitest";
import { COST_DEFAULTS, purchasedTokens, liquidation, immediateLossPct, effectiveBreakEven, cycleSaleQuantity } from "./costLedger";
const c = { ...COST_DEFAULTS, buyTaxPct: 8, sellTaxPct: 8, dexFeePct: 0 };
it("8% buy and 8% sell give 15.36% immediate loss, not 16%", () => { expect(immediateLossPct(100, 1, c)).toBeCloseTo(15.36, 10); });
it("net tokens are not discounted for buy tax a second time on liquidation", () => { expect(purchasedTokens(100,1,c)).toBe(92); expect(liquidation(92,1,c)).toBeCloseTo(84.64); });
it("break-even uses effective cost divided by net tokens and sell retention", () => { expect(effectiveBreakEven(100,92,c)).toBeCloseTo(100/84.64); });
it("partials use cycle-base rather than the remaining balance and final clears remainder", () => { expect(cycleSaleQuantity(100,70,30,false)).toBe(30); expect(cycleSaleQuantity(100,40,30,true)).toBe(40); });