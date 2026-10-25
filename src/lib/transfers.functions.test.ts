import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));
const token = `0x${"1".repeat(40)}`,
  pair = `0x${"2".repeat(40)}`,
  wallet = `0x${"3".repeat(40)}`;
const topic = (address: string) => `0x${address.slice(2).padStart(64, "0")}`;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

it("keeps a genuine dated list after refresh failure and caches only that token and pair", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T18:00:00Z"));
  let online = true;
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    if (!online) throw new Error("RPC failed https://example.test?key=secret");
    const request = JSON.parse(String(options.body));
    return {
      ok: true,
      json: async () => ({
        result:
          request.method === "eth_blockNumber"
            ? "0x10"
            : [
                {
                  transactionHash: "0xabc",
                  blockNumber: "0x10",
                  topics: ["0xtransfer", topic(pair), topic(wallet)],
                  data: "0x64",
                },
              ],
      }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  const { getTransfers } = await import("./transfers.functions");
  const first = await getTransfers({ data: { address: token, pool: pair } });
  expect(first.scannedBlocks).toBe(17);
  expect(first.ranking[0]).toMatchObject({ wallet, buys: 1, boughtRaw: "100" });
  const calls = fetcher.mock.calls.length;
  expect(await getTransfers({ data: { address: token, pool: pair } })).toEqual(first);
  expect(fetcher).toHaveBeenCalledTimes(calls);
  vi.setSystemTime(new Date("2026-10-25T18:01:00Z"));
  online = false;
  const stale = await getTransfers({ data: { address: token, pool: pair } });
  expect(stale.transfers).toEqual(first.transfers);
  expect(stale.fetchedAt).toBe(first.fetchedAt);
  expect(stale.error).toContain("data original");
  const other = await getTransfers({ data: { address: `0x${"4".repeat(40)}`, pool: pair } });
  expect(other.transfers).toEqual([]);
  expect(other.error).toContain("BNB Smart Chain");
  expect(other.error).not.toContain("secret");
});

it("bounds failed-provider attempts by a shared consultation deadline", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const fetcher = vi.fn(async () => {
    vi.setSystemTime(Date.now() + 3000);
    throw new Error("timeout");
  });
  vi.stubGlobal("fetch", fetcher);
  const { getTransfers } = await import("./transfers.functions");
  const result = await getTransfers({ data: { address: token, pool: pair } });
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(result.error).toContain("Não foi possível consultar");
  expect(result.scannedBlocks).toBe(0);
});
