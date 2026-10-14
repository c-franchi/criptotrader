import { beforeEach, describe, expect, it, vi } from "vitest";
const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }));
vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: () => ({ readContract }) }));
import { readMarket } from "./market.server";

const BGA = "0xDbb962A6Fa2b9AEAf27Ec2D7fd5e820d479bdb3D";
const pair = "0x2F5bB7Ef9eEeD9FBaB37007a428Aa0b7b8647bF7";
describe("Market fallback", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 })); });
  it("uses the BGA on-chain pool after a rate limit without inventing USD or volume", async () => {
    readContract.mockImplementation(({ functionName }) => {
      if (functionName === "getPair") return Promise.resolve(pair);
      if (functionName === "getReserves") return Promise.resolve([100n * 10n ** 18n, 2n * 10n ** 18n, 0]);
      return Promise.resolve(BGA);
    });
    const market = await readMarket(BGA, "fallback-success");
    expect(market.error).toBeNull();
    expect(market.pools[0]?.pairAddress).toBe(pair);
    expect(market.pools[0]?.baseSymbol).toBe("BGA");
    expect(market.pools[0]?.priceNative).toBe("0.02");
    expect(market.pools[0]?.volume24h).toBeNull();
    expect(market.pools[0]?.liquidityUsd).toBeNull();
    expect(market.pools[0]?.priceUsd).toBeNull();
    await readMarket(BGA, "fallback-success");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves failure instead of asserting that no pool exists", async () => {
    readContract.mockRejectedValue(new Error("RPC offline"));
    const market = await readMarket(BGA, "fallback-failure");
    expect(market.error).toContain("on-chain indisponível");
    expect(market.pools).toEqual([]);
  });
});