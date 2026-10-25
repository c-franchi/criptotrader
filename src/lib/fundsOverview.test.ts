import { expect, it } from "vitest";
import {
  uniqueFundWallets,
  fundsTotal,
  formatFundAmount,
  type FundWallet,
  fundAssetValue,
} from "./fundsOverview";
const wallet: FundWallet = {
  address: "0xabc",
  label: "Principal",
  personal: true,
  bot: false,
  scopes: ["one"],
  bnb: "1",
  assets: [],
  issues: [],
  capital: null,
};
it("counts a shared address once even when saved twice or used by multiple robots", () => {
  const refs = uniqueFundWallets([
    wallet,
    { ...wallet, address: "0xABC", bot: true, scopes: ["two"] },
  ]);
  expect(refs).toHaveLength(1);
  expect(refs[0]).toMatchObject({ personal: true, bot: true, scopes: ["one", "two"] });
});
it("sums real BNB and market value once, without adding reservations or recorded purchase cost", () => {
  const result = fundsTotal([
    {
      ...wallet,
      capital: { reserved: "0.5", gas: "0.1", free: "0.4" },
      assets: [{ address: "token", symbol: "T", amount: "100", priceBnb: "0.002" }],
    },
    { ...wallet, address: "other", bnb: "2" },
  ]);
  expect(result).toMatchObject({ total: "3.2", native: "3", tokens: "0.2", complete: true });
});
it("does not change consolidated wealth when BNB is transferred from a personal to a bot wallet", () => {
  expect(fundsTotal([wallet, { ...wallet, address: "bot", bnb: "0.5" }]).total).toBe(
    fundsTotal([
      { ...wallet, bnb: "0.5" },
      { ...wallet, address: "bot", bnb: "1" },
    ]).total,
  );
});
it("shows only a partial subtotal if a positive token has no price or a balance read failed", () => {
  const result = fundsTotal([
    { ...wallet, assets: [{ address: "token", symbol: "T", amount: "100", priceBnb: null }] },
  ]);
  expect(result).toMatchObject({ total: null, known: "1", missingAssets: 1 });
  expect(fundsTotal([{ ...wallet, bnb: null }])).toMatchObject({ total: null, native: null });
});
it("retains dust accurately and never formats a nonzero balance as zero", () => {
  expect(formatFundAmount("0.000000000000000001")).toBe("0,000000000000000001");
  expect(
    fundAssetValue({
      address: "t",
      symbol: "T",
      amount: "100000000000000000001",
      priceBnb: "0.000000000000000001",
    }),
  ).toBe("100.000000000000000001");
});
it("orders largest holdings with exact decimals and preserves unknown assets", async () => {
  const { fundWalletAssets } = await import("./fundsOverview");
  const sorted = fundWalletAssets({
    ...wallet,
    assets: [
      { address: "less", symbol: "L", amount: "1.000000000000000001", priceBnb: "1" },
      { address: "more", symbol: "M", amount: "1.000000000000000002", priceBnb: "1" },
      { address: "unknown", symbol: "U", amount: "100", priceBnb: null },
    ],
  });
  expect(sorted.map((a) => a.address)).toEqual(["more", "less", "native", "unknown"]);
});
