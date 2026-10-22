import { expect, it } from "vitest";
import { formatEther } from "viem";
import { walletCapital, strategyBuyAmount, type CapitalBot } from "./walletCapital";
import { EMPTY_CONFIG } from "./strategy";
const bot = (id: string, cap: number): CapitalBot => ({
  id,
  token: id,
  armed: true,
  mode: "estrategia",
  order_bnb: 0,
  gas_reserve_bnb: 0.001,
  strat_state: {},
  config: {
    ...EMPTY_CONFIG,
    buyAmount: 0.01,
    sizingMode: "fixo",
    gasReserveBnb: 0.001,
    allocationBnb: cap,
  },
});
it("separates liquid balance, investments, purchase reservations and gas without double subtraction", () => {
  const a = bot("a", 0.03);
  a.strat_state = { costBnb: 0.02, tokens: 10 };
  const c = walletCapital("0.1", [a, bot("b", 0.04)]);
  expect(c).toMatchObject({
    balance: "0.1",
    invested: "0.02",
    gas: "0.002",
    reserved: "0.05",
    free: "0.048",
    shortfall: "0",
  });
  expect(c.rows[0]?.available).toBe("0.01");
});
it("does not let either bot consume the other bot's reserved capital", () => {
  const c = walletCapital("0.05", [bot("a", 0.03), bot("b", 0.04)]);
  expect(c.shortfall).toBe("0.022");
  expect(c.free).toBe("0");
  expect(c.rows[0]?.available).toBe("0.008");
  expect(c.rows[1]?.available).toBe("0.018");
});
it("keeps paused investments but releases new-entry reservations; preview explicitly includes one paused bot", () => {
  const a = bot("a", 0.03);
  a.armed = false;
  a.strat_state = { costBnb: 0.01, tokens: 4 };
  expect(walletCapital("0.1", [a])).toMatchObject({
    invested: "0.01",
    reserved: "0",
    gas: "0",
    free: "0.1",
  });
  expect(walletCapital("0.1", [a], "a")).toMatchObject({
    invested: "0.01",
    reserved: "0.02",
    gas: "0.001",
    free: "0.079",
  });
});
it("reserves percentage entry once, rather than squaring the percentage", () => {
  const a = bot("a", 0);
  const b = bot("b", 0);
  a.config = b.config = {
    ...EMPTY_CONFIG,
    gasReserveBnb: 0,
    sizingMode: "percentual",
    buyAmount: 50,
  };
  const c = walletCapital("0.1", [a, b]);
  expect(c.reserved).toBe("0.1");
  expect(c.rows[0]?.available).toBe("0.05");
  expect(
    formatEther(
      strategyBuyAmount(
        { ...EMPTY_CONFIG, gasReserveBnb: 0, buyAmount: 50 },
        c.rows[0]!.available,
        c.rows[0]!.reserved,
      ),
    ),
  ).toBe("0.05");
});
it("reserves remaining fixed entries and honors the smaller explicit exposure cap", () => {
  const a = bot("a", 0);
  a.config = { ...a.config, maxEntries: 3 };
  a.strat_state = { entries: 1, costBnb: 0.01 };
  expect(walletCapital("1", [a]).reserved).toBe("0.02");
  a.config = { ...a.config, allocationBnb: 0.05, maxExposureQuote: 0.03 };
  expect(walletCapital("1", [a]).rows[0]?.available).toBe("0.02");
});
it("protects strategy and grid reservations using wei precision for tiny balances", () => {
  const a = bot("a", 0);
  a.config = { ...a.config, buyAmount: 0.000000001, gasReserveBnb: 0 };
  const grid: CapitalBot = {
    ...bot("b", 0),
    mode: "grade",
    order_bnb: "0.000000002",
    gas_reserve_bnb: 0,
  };
  const c = walletCapital("0.000000005", [a, grid]);
  expect(c).toMatchObject({ reserved: "0.000000003", free: "0.000000002" });
});
