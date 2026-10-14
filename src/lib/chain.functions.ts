import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const GTE_ADDRESS = "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA";
const DEFAULT_RPC = "https://bsc-dataseed.bnbchain.org";

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 300 * 2 ** i));
    }
  }
  throw last;
}

async function rpc(url: string, method: string, params: unknown[]) {
  return withRetry(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) throw new Error("Limite de requisições do RPC");
    const j = (await res.json()) as { result?: string; error?: { message: string } };
    if (j.error) throw new Error(j.error.message);
    return j.result as string;
  });
}

function decodeString(hex: string): string | null {
  const h = hex.replace(/^0x/, "");
  if (h.length < 128) return null;
  const len = parseInt(h.slice(64, 128), 16);
  const data = h.slice(128, 128 + len * 2);
  const bytes = new Uint8Array(data.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? []);
  return new TextDecoder().decode(bytes);
}

type Field = { value: string | null; error?: string };

export const validateToken = createServerFn({ method: "GET" })
  .inputValidator((d: { address?: string }) =>
    z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const url = process.env["BSC_RPC_URL"] || DEFAULT_RPC;
    const address = data.address ?? GTE_ADDRESS;
    const out: {
      rpc: string;
      checkedAt: string;
      chainId: Field;
      block: Field;
      hasCode: Field;
      name: Field;
      symbol: Field;
      decimals: Field;
      totalSupplyRaw: Field;
    } = {
      rpc: process.env["BSC_RPC_URL"] ? "RPC personalizado" : DEFAULT_RPC,
      checkedAt: new Date().toISOString(),
      chainId: { value: null },
      block: { value: null },
      hasCode: { value: null },
      name: { value: null },
      symbol: { value: null },
      decimals: { value: null },
      totalSupplyRaw: { value: null },
    };
    const run = async (k: keyof typeof out, f: () => Promise<string | null>) => {
      try {
        (out[k] as Field).value = await f();
      } catch (e) {
        (out[k] as Field).error = e instanceof Error ? e.message : "falha";
      }
    };
    const call = (sel: string) => rpc(url, "eth_call", [{ to: address, data: sel }, "latest"]);
    await Promise.all([
      run("chainId", async () => String(parseInt(await rpc(url, "eth_chainId", []), 16))),
      run("block", async () => String(parseInt(await rpc(url, "eth_blockNumber", []), 16))),
      run("hasCode", async () => String((await rpc(url, "eth_getCode", [address, "latest"])).length > 2)),
      run("name", async () => decodeString(await call("0x06fdde03"))),
      run("symbol", async () => decodeString(await call("0x95d89b41"))),
      run("decimals", async () => BigInt(await call("0x313ce567")).toString()),
      run("totalSupplyRaw", async () => BigInt(await call("0x18160ddd")).toString()),
    ]);
    return out;
  });

export type PoolInfo = {
  pairAddress: string;
  dexId: string;
  version: string;
  supported: boolean;
  baseSymbol: string;
  quoteSymbol: string;
  quoteAddress: string;
  priceNative: string | null;
  priceUsd: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  url: string;
};

export const getMarket = createServerFn({ method: "GET" }).handler(async () => {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await withRetry(() =>
      fetch(`https://api.dexscreener.com/token-pairs/v1/bsc/${GTE_ADDRESS}`, {
        signal: AbortSignal.timeout(8000),
      }).then((r) => {
        if (r.status === 429) throw new Error("Limite de requisições da DexScreener");
        if (!r.ok) throw new Error(`DexScreener HTTP ${r.status}`);
        return r.json();
      }),
    );
    const arr = (Array.isArray(res) ? res : []) as Array<any>;
    const pools: PoolInfo[] = arr.map((p) => {
      const version = (p.labels?.[0] as string | undefined) ?? "desconhecida";
      const isPancake = String(p.dexId).toLowerCase().includes("pancake");
      return {
        pairAddress: p.pairAddress,
        dexId: p.dexId,
        version,
        supported: isPancake && version.toLowerCase() === "v2",
        baseSymbol: p.baseToken?.symbol ?? "?",
        quoteSymbol: p.quoteToken?.symbol ?? "?",
        quoteAddress: p.quoteToken?.address ?? "",
        priceNative: p.priceNative ?? null,
        priceUsd: p.priceUsd ?? null,
        liquidityUsd: p.liquidity?.usd ?? null,
        volume24h: p.volume?.h24 ?? null,
        priceChange24h: p.priceChange?.h24 ?? null,
        url: p.url,
      };
    });
    pools.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    return { pools, fetchedAt, source: "DexScreener", error: null as string | null };
  } catch (e) {
    return {
      pools: [] as PoolInfo[],
      fetchedAt,
      source: "DexScreener",
      error: e instanceof Error ? e.message : "falha",
    };
  }
});
