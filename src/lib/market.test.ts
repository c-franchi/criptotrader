import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { readContract, getBlock } = vi.hoisted(() => ({ readContract: vi.fn(), getBlock: vi.fn() }));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => ({ readContract, getBlock }),
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function liveRpc() {
  getBlock.mockResolvedValue({ number: 123n, timestamp: BigInt(Math.floor(Date.now() / 1000)) });
  const usdPair = "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE";
  readContract.mockImplementation(async ({ functionName, args, address }) => {
    if (functionName === "decimals") return 18;
    if (functionName === "symbol" || functionName === "name") return "BGA";
    if (functionName === "getPair")
      return String(args?.[1]).toLowerCase() === "0x55d398326f99059ff775485246999027b3197955"
        ? usdPair
        : pair;
    if (functionName === "getReserves")
      return address === usdPair
        ? [600n * 10n ** 18n, 10n ** 18n, 0]
        : [100n * 10n ** 18n, 2n * 10n ** 18n, 0];
    return address === usdPair ? "0x55d398326f99059fF775485246999027B3197955" : BGA;
  });
}
it("prices live trading from a single block, without waiting for an aggregator, and coalesces callers", async () => {
  vi.clearAllMocks();
  liveRpc();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aggregator slow")));
  const [a, b] = await Promise.all([
    readMarket(BGA, "live-success", { live: true }),
    readMarket(BGA, "live-success", { live: true }),
  ]);
  expect(a).toEqual(b);
  expect(a.error).toBeNull();
  expect(Number(a.pools[0]?.priceUsd)).toBeCloseTo(12);
  expect(a.source).toContain("bloco 123");
  expect(getBlock).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  const pricingReads = readContract.mock.calls
    .map(([args]) => args)
    .filter((x) => ["getPair", "token0", "getReserves"].includes(x.functionName));
  expect(pricingReads.length).toBeGreaterThan(4);
  expect(pricingReads.every((x) => x.blockNumber === 123n)).toBe(true);
});
it("expires the fast cache after 300 milliseconds and preserves old quote age with an error when refresh fails", async () => {
  vi.clearAllMocks();
  liveRpc();
  const clock = vi.spyOn(Date, "now").mockReturnValue(1800000000000);
  getBlock.mockResolvedValue({ number: 123n, timestamp: 1800000000n });
  const a = await readMarket(BGA, "live-expiry", { live: true });
  clock.mockReturnValue(1800000000301);
  getBlock.mockRejectedValue(new Error("RPC unavailable"));
  const b = await readMarket(BGA, "live-expiry", { live: true });
  expect(getBlock).toHaveBeenCalledTimes(3);
  expect(b.fetchedAt).toBe(a.fetchedAt);
  expect(b.error).toBeTruthy();
});
it("rejects an old RPC block instead of relabeling it as a new price", async () => {
  vi.clearAllMocks();
  liveRpc();
  getBlock.mockResolvedValue({
    number: 120n,
    timestamp: BigInt(Math.floor(Date.now() / 1000) - 60),
  });
  const a = await readMarket(BGA, "live-stale", { live: true });
  expect(a.error).toBeTruthy();
  expect(a.pools).toEqual([]);
  expect(readContract).not.toHaveBeenCalled();
});

it("reuses the live decision's pinned reserves in the executor instead of reading the pool twice", async () => {
  vi.clearAllMocks();
  liveRpc();
  vi.stubEnv("BSC_RPC_URL", "live-shared-executor");
  const quote = await readMarket(BGA, "live-shared-executor", { live: true });
  const count = readContract.mock.calls.length;
  const { poolState } = await import("./bot.server");
  const pool = await poolState(BGA, BigInt(quote.blockNumber!));
  expect(pool?.price).toBe(0.02);
  expect(readContract.mock.calls.length).toBe(count);
});
