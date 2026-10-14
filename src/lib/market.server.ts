import { createPublicClient, formatUnits, getAddress, http } from "viem";
import { bsc } from "viem/chains";
import { PANCAKE_V2_FACTORY, WBNB, ZERO, factoryAbi, pairAbi } from "./pancake";
import { findToken } from "./tokens";
import type { PoolInfo } from "./chain.functions";

type Market = { pools: PoolInfo[]; fetchedAt: string; source: string; error: string | null };
type DexPair = {
  pairAddress: string; dexId: string; labels?: string[];
  baseToken?: { symbol?: string }; quoteToken?: { symbol?: string; address?: string };
  priceNative?: string; priceUsd?: string; liquidity?: { usd?: number };
  volume?: { h24?: number }; priceChange?: { h24?: number }; url: string;
};
const cache = new Map<string, { expires: number; result: Market }>();
const pending = new Map<string, Promise<Market>>();

async function onChainPool(address: string, rpcUrl: string): Promise<PoolInfo[]> {
  const token = getAddress(address);
  const info = findToken(address);
  if (!info) throw new Error("Token não suportado");
  const client = createPublicClient({ chain: bsc, transport: http(rpcUrl, { timeout: 8000, retryCount: 1 }) });
  const pair = await client.readContract({ address: PANCAKE_V2_FACTORY, abi: factoryAbi, functionName: "getPair", args: [token, WBNB] });
  if (pair === ZERO) return [];
  const [[r0, r1], token0] = await Promise.all([
    client.readContract({ address: pair, abi: pairAbi, functionName: "getReserves" }),
    client.readContract({ address: pair, abi: pairAbi, functionName: "token0" }),
  ]);
  const isToken0 = token0.toLowerCase() === token.toLowerCase();
  const tokenReserve = isToken0 ? r0 : r1;
  const bnbReserve = isToken0 ? r1 : r0;
  const price = tokenReserve > 0n && bnbReserve > 0n
    ? String(Number(formatUnits(bnbReserve, 18)) / Number(formatUnits(tokenReserve, info.decimals))) : null;
  return [{ pairAddress: pair, dexId: "pancakeswap", version: "v2", supported: true,
    baseSymbol: info.symbol, quoteSymbol: "WBNB", quoteAddress: WBNB, priceNative: price,
    priceUsd: null, liquidityUsd: null, volume24h: null, priceChange24h: null,
    url: `https://bscscan.com/address/${pair}` }];
}

async function fetchMarket(address: string, rpcUrl: string): Promise<Market> {
  const fetchedAt = new Date().toISOString();
  let dexError: string | null = null;
  try {
    const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/bsc/${address}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(res.status === 429 ? "Limite de requisições da DexScreener" : "DexScreener indisponível");
    const payload: unknown = await res.json();
    if (!Array.isArray(payload)) throw new Error("Resposta de mercado inválida");
    const pools: PoolInfo[] = (payload as DexPair[]).map((p) => {
      const version = p.labels?.[0] ?? "desconhecida";
      return { pairAddress: p.pairAddress, dexId: p.dexId, version,
        supported: String(p.dexId).toLowerCase().includes("pancake") && version.toLowerCase() === "v2",
        baseSymbol: p.baseToken?.symbol ?? "?", quoteSymbol: p.quoteToken?.symbol ?? "?", quoteAddress: p.quoteToken?.address ?? "",
        priceNative: p.priceNative ?? null, priceUsd: p.priceUsd ?? null, liquidityUsd: p.liquidity?.usd ?? null,
        volume24h: p.volume?.h24 ?? null, priceChange24h: p.priceChange?.h24 ?? null, url: p.url };
    });
    pools.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    if (pools.length) return { pools, fetchedAt, source: "DexScreener", error: null };
  } catch (e) {
    dexError = e instanceof Error ? e.message : "DexScreener indisponível";
  }
  try {
    return { pools: await onChainPool(address, rpcUrl), fetchedAt, source: "PancakeSwap V2 · consulta on-chain", error: null };
  } catch {
    return { pools: [], fetchedAt, source: "DexScreener / PancakeSwap V2", error: dexError ? `${dexError}; consulta on-chain indisponível` : "Consulta on-chain indisponível" };
  }
}

export async function readMarket(address: string, rpcUrl: string): Promise<Market> {
  const key = `${rpcUrl}:${address.toLowerCase()}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.result;
  const active = pending.get(key);
  if (active) return active;
  const request = fetchMarket(address, rpcUrl).then((result) => {
    if (cache.size >= 100) cache.clear();
    cache.set(key, { result, expires: Date.now() + 30_000 });
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}