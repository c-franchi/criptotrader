import { it, expect } from "vitest";
import { botPerformance } from "./botPerformance";
const buy = {
  side: "compra",
  status: "confirmada",
  amount_in: "1000000000000000000",
  actual_token_delta: "100",
  actual_bnb_received: null,
  gas_bnb: "0.01",
};
it("separates closed results, open valuation and recorded gas without counting deposits as profit", () => {
  const sell = {
    ...buy,
    side: "venda",
    actual_token_delta: "-50",
    actual_bnb_received: "0.6",
    gas_bnb: "0.02",
  };
  const r = botPerformance([buy, sell], 0.505, 50, 10, 1000);
  expect(r.realized).toBeCloseTo(0.075);
  expect(r.open).toBeCloseTo(-0.005);
  expect(r.total).toBeCloseTo(0.07);
  expect(r.fees).toBeCloseTo(0.03);
});
it("does not invent realized results from quotes or incomplete history", () => {
  const sell = { ...buy, side: "venda", actual_token_delta: "-100" };
  expect(botPerformance([buy, sell], 0, 0, null, null).realized).toBeNull();
  expect(botPerformance([buy], 1.01, 100, null, null).open).toBeNull();
  expect(botPerformance([buy], 1.01, 100, 10, 1000, true).total).toBeNull();
});

it("continues valuing retained purchases without treating the automation stop as a sale", () => {
  const report = botPerformance([buy], 1.01, 100, 12, 1000);
  expect(report.realized).toBe(0);
  expect(report.open).toBeCloseTo(0.19);
  expect(report.total).toBeCloseTo(0.19);
});

it("does not mistake a full sale for an oversell due to raw token rounding", () => {
  const raw = "10000000000000000000123";
  const result = botPerformance(
    [
      { ...buy, actual_token_delta: raw },
      {
        ...buy,
        side: "venda",
        actual_token_delta: "-" + raw,
        actual_bnb_received: "1.2",
        gas_bnb: "0.02",
      },
    ],
    0,
    0,
    null,
    null,
  );
  expect(result.realized).toBeCloseTo(0.17);
});
