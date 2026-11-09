import { describe, expect, it } from "vitest";
import {
  initialSellDraftKey,
  initialSellDraftSchema,
  initialSellQuantity,
  validSellDraftForWallet,
} from "./initialSellPlan";

const WALLET = "0x" + "a".repeat(40);
const TOKEN = "0x" + "b".repeat(40);
const base = {
  version: 1 as const,
  mode: "sell_only" as const,
  sharePct: 100,
  minPriceBnb: "0.000000000000000001",
  balanceSnapshot: "123456.123456789123456789",
  tokenAddress: TOKEN,
  walletAddress: WALLET,
  createdAt: "2026-11-08T20:00:00.000Z",
};

describe("sale-first PREVIEW only", () => {
  it("isolates drafts between portfolios, wallets, users and tokens", () => {
    expect(initialSellDraftKey("u1", "scope1", WALLET, TOKEN)).not.toBe(
      initialSellDraftKey("u1", "scope2", WALLET, TOKEN),
    );
    expect(initialSellDraftKey("u1", "scope1", WALLET, TOKEN)).not.toBe(
      initialSellDraftKey("u2", "scope1", WALLET, TOKEN),
    );
    expect(initialSellDraftKey("u1", "scope1", WALLET, TOKEN)).not.toBe(
      initialSellDraftKey("u1", "scope1", WALLET, "0x" + "c".repeat(40)),
    );
  });

  it("preserves exact decimal token quantities without float rounding", () => {
    expect(initialSellQuantity("123456.123456789123456789", 50)).toBe("61728.0617283945617283945");
    expect(initialSellQuantity("1", 100)).toBe("1");
    expect(initialSellQuantity("1", 0)).toBeNull();
    expect(initialSellQuantity("-1", 50)).toBeNull();
    expect(initialSellQuantity("", 20)).toBeNull();
  });

  it("refuses stale balances and other token or wallet addresses", () => {
    expect(validSellDraftForWallet(base, WALLET, TOKEN, base.balanceSnapshot)).toBe(true);
    expect(validSellDraftForWallet(base, WALLET, TOKEN, "123456.12")).toBe(false);
    expect(validSellDraftForWallet(base, "0x" + "c".repeat(40), TOKEN, base.balanceSnapshot)).toBe(false);
    expect(validSellDraftForWallet(base, WALLET, "0x" + "c".repeat(40), base.balanceSnapshot)).toBe(false);
    expect(validSellDraftForWallet({ ...base, mode: "execute_now" }, WALLET, TOKEN, base.balanceSnapshot)).toBe(false);
  });

  it("requires positive price and planned quantity but offers no executable order", () => {
    expect(initialSellDraftSchema.safeParse(base).success).toBe(true);
    expect(initialSellDraftSchema.safeParse({ ...base, minPriceBnb: "0" }).success).toBe(false);
    expect(initialSellDraftSchema.safeParse({ ...base, minPriceBnb: "-1" }).success).toBe(false);
    expect(initialSellDraftSchema.safeParse({ ...base, sharePct: 0 }).success).toBe(false);
    expect(initialSellDraftSchema.safeParse({ ...base, sharePct: 101 }).success).toBe(false);
    expect(initialSellDraftSchema.safeParse({ ...base, balanceSnapshot: "0" }).success).toBe(false);
    expect(Object.keys(base)).not.toContain("armed");
    expect(Object.keys(base)).not.toContain("walletSecret");
  });
});
