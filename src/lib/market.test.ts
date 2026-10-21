import { beforeEach, describe, expect, it, vi } from "vitest";
const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => ({ readContract }),
}));
import { readMarket } from "./market.server";

const BGA = "0xDbb962A6Fa2b9AEAf27Ec2D7fd5e820d479bdb3D";
const pair = "0x2F5bB7Ef9eEeD9FBaB37007a428Aa0b7b8647bF7";
describe("Market fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
  });
  it("uses the BGA on-chain pool after a rate limit and converts to USD through the BNB/USDT pool without inventing volume", async () => {
    const usdtPair = "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE";
    readContract.mockImplementation(({ functionName, args, address }) => {
      if (functionName === "decimals") return Promise.resolve(18);
      if (functionName === "symbol") return Promise.resolve("BGA");
      if (functionName === "name") return Promise.resolve("BGA");
      if (functionName === "getPair")
        return Promise.resolve(
          String(args?.[1]).toLowerCase() === "0x55d398326f99059ff775485246999027b3197955"
            ? usdtPair
            : pair,
        );
      if (functionName === "getReserves" && address === usdtPair)
        return Promise.resolve([600n * 10n ** 18n, 1n * 10n ** 18n, 0]);
      if (functionName === "token0" && address === usdtPair)
        return Promise.resolve("0x55d398326f99059fF775485246999027B3197955");
      if (functionName === "getReserves")
        return Promise.resolve([100n * 10n ** 18n, 2n * 10n ** 18n, 0]);
      return Promise.resolve(BGA);
    });
    const market = await readMarket(BGA, "fallback-success");
    expect(market.error).toBeNull();
    expect(market.pools[0]?.pairAddress).toBe(pair);
    expect(market.pools[0]?.baseSymbol).toBe("BGA");
    expect(market.pools[0]?.priceNative).toBe("0.02");
    expect(market.pools[0]?.volume24h).toBeNull();
    expect(Number(market.pools[0]?.priceUsd)).toBeCloseTo(12); // 0.02 BNB × US$ 600
    expect(market.pools[0]?.liquidityUsd).toBeCloseTo(2400); // 2 BNB × 600 × 2
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
