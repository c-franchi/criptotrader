import { expect, it } from "vitest";
import { closedBotCycles, type CycleOrder } from "./closedBotCycles";
const buy: CycleOrder = {
  id: "1",
  created_at: "2026-01-01T00:00:00Z",
  side: "compra",
  status: "confirmada",
  amount_in: "1000000000000000000",
  actual_token_delta: "100",
  actual_bnb_received: null,
  gas_bnb: "0.01",
};
const sale: CycleOrder = {
  ...buy,
  id: "2",
  created_at: "2026-01-02T00:00:00Z",
  side: "venda",
  actual_token_delta: "-100",
  actual_bnb_received: "1.2",
  gas_bnb: "0.02",
  tx_hash: "0xsale",
};
it("combines all entries and partial exits until the position is fully closed", () => {
  const cycles = closedBotCycles([
    buy,
    { ...buy, id: "1b", amount_in: "2000000000000000000", actual_token_delta: "200" },
    { ...sale, actual_token_delta: "-150", actual_bnb_received: "1.8" },
    {
      ...sale,
      id: "3",
      created_at: "2026-01-03",
      actual_token_delta: "-150",
      actual_bnb_received: "1.7",
    },
  ]);
  expect(cycles).toHaveLength(1);
  expect(cycles[0]).toMatchObject({
    buys: 2,
    invested: "3",
    received: "3.5",
    gas: "0.06",
    net: "0.44",
    complete: true,
  });
});
it("never substitutes a quote for proceeds and does not contaminate a later complete cycle", () => {
  const cycles = closedBotCycles([
    buy,
    { ...sale, actual_bnb_received: null, quoted_out: "9000000000000000000" },
    { ...buy, id: "3", created_at: "2026-01-03" },
    { ...sale, id: "4", created_at: "2026-01-04" },
  ]);
  expect(cycles[1]).toMatchObject({ received: null, net: null, pendingHashes: ["0xsale"] });
  expect(cycles[0]?.net).toBe("0.17");
});
it("shows confirmed proceeds even when gas is missing, without claiming a net result", () => {
  expect(closedBotCycles([buy, { ...sale, gas_bnb: null }])[0]).toMatchObject({
    received: "1.2",
    gas: null,
    net: null,
  });
});
it("does not call an open or truncated position a confirmed closed profit", () => {
  expect(closedBotCycles([buy])).toEqual([]);
  expect(closedBotCycles([buy, sale], true)[0]?.net).toBeNull();
});
it("includes the gas of failed attempts in the cycle", () => {
  expect(
    closedBotCycles([
      buy,
      { ...sale, id: "f", created_at: "2026-01-01T12:00:00Z", status: "falhou", gas_bnb: "0.03" },
      sale,
    ])[0]?.net,
  ).toBe("0.14");
});

it("keeps exact raw token quantities beyond twenty digits", () => {
  const raw = "10000000000000000000123";
  const cycle = closedBotCycles([
    { ...buy, actual_token_delta: raw },
    { ...sale, actual_token_delta: "-" + raw },
  ])[0];
  expect(cycle).toMatchObject({ complete: true, received: "1.2", net: "0.17" });
});

it("reconstructs the GTE break-even from the reported purchase, both gas charges and pending sale", () => {
  const boughtRaw = "112378225971855884915500";
  const input: CycleOrder = {
    ...buy,
    id: "gte-buy",
    created_at: "2026-11-06T02:55:54Z",
    amount_in: "5199212254810774",
    actual_token_delta: boughtRaw,
    gas_bnb: "0.00000731915",
  };
  const sold: CycleOrder = {
    ...sale,
    id: "gte-sale",
    created_at: "2026-11-06T03:08:17Z",
    amount_in: boughtRaw,
    actual_token_delta: "-" + boughtRaw,
    gas_bnb: "0.00000998855",
    actual_bnb_received: null,
    tx_hash: "0xgte-sale",
  };
  const pending = closedBotCycles([sold, input])[0];
  expect(pending).toMatchObject({
    invested: "0.005199212254810774",
    gas: "0.0000173077",
    breakEven: "0.005216519954810774",
    received: null,
    net: null,
    pendingHashes: ["0xgte-sale"],
    complete: false,
  });
  // This hypothetical receipt is only a test fixture, NOT a claim about the real sale.
  const confirmed = closedBotCycles([input, { ...sold, actual_bnb_received: "0.0053" }])[0];
  expect(confirmed).toMatchObject({
    received: "0.0053",
    breakEven: "0.005216519954810774",
    net: "0.000083480045189226",
    complete: true,
  });
});
