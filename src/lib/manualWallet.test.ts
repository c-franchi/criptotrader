import { expect, it } from "vitest";
import { manualSearch, manualWalletBlocks } from "./manualWallet";
it("does not require a strategy or tracked wallet for a funded personal wallet", () => {
  expect(
    manualWalletBlocks({
      expected: "0xABC",
      account: "0xabc",
      chainId: 56,
      robot: false,
      balanceKnown: true,
    }),
  ).toEqual([]);
});
it("blocks mismatched signing accounts, wrong networks, unknown balances and robot wallets", () => {
  expect(
    manualWalletBlocks({
      expected: "a",
      account: "b",
      chainId: 1,
      robot: false,
      balanceKnown: false,
    }),
  ).toHaveLength(3);
  expect(
    manualWalletBlocks({
      expected: "a",
      account: null,
      chainId: null,
      robot: false,
      balanceKnown: true,
    })[0],
  ).toContain("Conecte");
  expect(
    manualWalletBlocks({
      expected: "a",
      account: "a",
      chainId: 56,
      robot: true,
      balanceKnown: true,
    })[0],
  ).toContain("automática");
});
it("accepts only a token contract and numeric suggestion in the manual deep link", () => {
  expect(manualSearch({ token: "0x" + "1".repeat(40), entrada: "0.01", side: "sell" })).toEqual({
    token: "0x" + "1".repeat(40),
    entrada: "0.01",
  });
  expect(manualSearch({ token: "javascript:alert(1)", entrada: "all" })).toEqual({});
});
