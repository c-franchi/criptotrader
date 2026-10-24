import { afterEach, expect, it, vi } from "vitest";
const fallback = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: unknown) => fn,
    inputValidator: () => ({ handler: (fn: unknown) => fn }),
  }),
}));
vi.mock("./market.server", () => ({ bnbUsdPrice: fallback }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  vi.resetModules();
});
it("keeps the fiat conversion available using pool reserves if the aggregator fails", async () => {
  fallback.mockResolvedValue(700);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("dexscreener")
        ? { ok: false, status: 429 }
        : { ok: true, json: async () => ({ rates: { BRL: 5, EUR: 0.9 } }) },
    ),
  );
  const { getFxQuote } = await import("./fx.functions");
  expect(await getFxQuote()).toMatchObject({ bnbUsd: 700, usdBrl: 5, usdEur: 0.9 });
  expect(fallback).toHaveBeenCalledTimes(1);
});
it("does not fabricate a conversion rate when both quote sources fail", async () => {
  fallback.mockRejectedValue(new Error("offline"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  const { getFxQuote } = await import("./fx.functions");
  expect((await getFxQuote()).bnbUsd).toBeNull();
});
