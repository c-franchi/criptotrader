import { expect, it } from "vitest";
import { personalFundWallets, relatedRobotWallets } from "./walletGroups";
import type { FundWallet } from "./fundsOverview";
const wallet: FundWallet = {
  address: "personal",
  label: "Pessoal",
  personal: true,
  bot: false,
  scopes: ["a"],
  bnb: "1",
  assets: [],
  issues: [],
  capital: null,
};
it("excludes robot-owned addresses from manual choices and associates robots only with their real scope", () => {
  const robot = {
    ...wallet,
    address: "robot",
    personal: false,
    bot: true,
    scopes: ["a", "b"],
    robotScopes: ["a"],
  };
  expect(personalFundWallets([wallet, robot])).toEqual([wallet]);
  expect(relatedRobotWallets([wallet, robot], ["a"])).toEqual([robot]);
  expect(relatedRobotWallets([wallet, robot], ["b"])).toEqual([]);
});
