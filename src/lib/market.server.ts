import { createPublicClient, formatUnits, getAddress, http } from "viem";
import { bsc } from "viem/chains";
import { PANCAKE_V2_FACTORY, WBNB, ZERO, factoryAbi, pairAbi } from "./pancake";
import { tokenMeta } from "./tokenMeta.server";
import type { PoolInfo } from "./chain.functions";

type Market = { pools: PoolInfo[]; fetchedAt: string; source: string; error: string | null };
type DexPair = {
  pairAddress: string;
  dexId: string;
  labels?: string[];
  baseToken?: { symbol?: string };
  quoteToken?: { symbol?: string; address?: string };
  priceNative?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  url: string;
};
const cache = new Map<string, { expires: number; result: Market }>();
const pending = new Map<string, Promise<Market>>();

const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;
/** BNB price in USD from the PancakeSwap V2 WBNB/USDT pool (both 18 decimals). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bnbUsdPrice(client: any, blockNumber?: bigint): Promise<number | null> {
  const pair = await client.readContract({
    address: PANCAKE_V2_FACTORY,
    blockNumber,
    abi: factoryAbi,
    functionName: "getPair",
    args: [WBNB, USDT],
  });
  if (pair === ZERO) return null;
  const [[r0, r1], token0] = await Promise.all([
    client.readContract({ address: pair, abi: pairAbi, blockNumber, functionName: "getReserves" }),
    client.readContract({ address: pair, abi: pairAbi, blockNumber, functionName: "token0" }),
  ]);
  const wbnbIs0 = String(token0).toLowerCase() === WBNB.toLowerCase();
  const bnb = Number(formatUnits(wbnbIs0 ? r0 : r1, 18)),
    usd = Number(formatUnits(wbnbIs0 ? r1 : r0, 18));
  return bnb > 0 ? usd / bnb : null;
}

async function onChainPool(
  address: string,
  rpcUrl: string,
  blockNumber?: bigint,
): Promise<PoolInfo[]> {
  const token = getAddress(address);
  const info = await tokenMeta(address);
  const client = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl, { timeout: 8000, retryCount: 1 }),
  });
  const pair = await client.readContract({
    address: PANCAKE_V2_FACTORY,
    blockNumber,
    abi: factoryAbi,
    functionName: "getPair",
    args: [token, WBNB],
  });
  if (pair === ZERO) return [];
  const [[r0, r1], token0] = await Promise.all([
    client.readContract({ address: pair, abi: pairAbi, blockNumber, functionName: "getReserves" }),
    client.readContract({ address: pair, abi: pairAbi, blockNumber, functionName: "token0" }),
  ]);
  const isToken0 = token0.toLowerCase() === token.toLowerCase();
  const tokenReserve = isToken0 ? r0 : r1;
  const bnbReserve = isToken0 ? r1 : r0;
  const price =
    tokenReserve > 0n && bnbReserve > 0n
      ? String(
          Number(formatUnits(bnbReserve, 18)) / Number(formatUnits(tokenReserve, info.decimals)),
        )
      : null;
  const bnbUsd = await bnbUsdPrice(client, blockNumber).catch(() => null);
  const priceUsd = price && bnbUsd ? String(Number(price) * bnbUsd) : null;
  const liquidityUsd = bnbUsd ? Number(formatUnits(bnbReserve, 18)) * bnbUsd * 2 : null;
  return [
    {
      pairAddress: pair,
      dexId: "pancakeswap",
      version: "v2",
      supported: true,
      baseSymbol: info.symbol,
      quoteSymbol: "WBNB",
      quoteAddress: WBNB,
      priceNative: price,
      priceUsd,
      liquidityUsd,
      volume24h: null,
      priceChange24h: null,
      url: `https://bscscan.com/address/${pair}`,
    },
  ];
}

async function fetchMarket(address: string, rpcUrl: string): Promise<Market> {
  const fetchedAt = new Date().toISOString();
  let dexError: string | null = null;
  try {
    const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/bsc/${address}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
      throw new Error(
        res.status === 429 ? "Limite de requisições da DexScreener" : "DexScreener indisponível",
      );
    const payload: unknown = await res.json();
    if (!Array.isArray(payload)) throw new Error("Resposta de mercado inválida");
    const pools: PoolInfo[] = (payload as DexPair[]).map((p) => {
      const version = p.labels?.[0] ?? "desconhecida";
      return {
        pairAddress: p.pairAddress,
        dexId: p.dexId,
        version,
        supported:
          String(p.dexId).toLowerCase() === "pancakeswap" &&
          version.toLowerCase() === "v2" &&
          p.quoteToken?.address?.toLowerCase() === WBNB.toLowerCase(),
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
    if (!pools.some((p) => p.supported)) {
      const direct = await onChainPool(address, rpcUrl).catch(() => []);
      for (const p of direct)
        if (!pools.some((x) => x.pairAddress.toLowerCase() === p.pairAddress.toLowerCase()))
          pools.push(p);
    }
    if (pools.length)
      return { pools, fetchedAt, source: "DexScreener / PancakeSwap V2 WBNB", error: null };
  } catch (e) {
    dexError = e instanceof Error ? e.message : "DexScreener indisponível";
  }
  try {
    return {
      pools: await onChainPool(address, rpcUrl),
      fetchedAt,
      source: "PancakeSwap V2 · consulta on-chain",
      error: null,
    };
  } catch {
    return {
      pools: [],
      fetchedAt,
      source: "DexScreener / PancakeSwap V2",
      error: dexError
        ? `${dexError}; consulta on-chain indisponível`
        : "Consulta on-chain indisponível",
    };
  }
}

async function fetchTradingMarket(address: string, rpcUrl: string): Promise<Market> {
  try {
    const client = createPublicClient({
      chain: bsc,
      transport: http(rpcUrl, { timeout: 4000, retryCount: 0 }),
    });
    const block = await client.getBlock({ blockTag: "latest" });
    const fetchedAt = new Date(Number(block.timestamp) * 1000).toISOString();
    if (
      Date.now() - Number(block.timestamp) * 1000 > 15_000 ||
      Number(block.timestamp) * 1000 > Date.now() + 5_000
    )
      throw new Error("RPC retornou um bloco antigo ou horário inválido");
    const pools = await onChainPool(address, rpcUrl, block.number);
    return {
      pools,
      fetchedAt,
      source: `PancakeSwap V2 · on-chain · bloco ${block.number}`,
      error: pools.some((p) => Number(p.priceUsd) > 0)
        ? null
        : "Cotação USD do par BNB compatível indisponível",
    };
  } catch {
    return {
      pools: [],
      fetchedAt: new Date().toISOString(),
      source: "PancakeSwap V2 · on-chain",
      error: "Cotação on-chain indisponível; aguardando consulta atualizada",
    };
  }
}

export async function readMarket(
  address: string,
  rpcUrl: string,
  options?: { live?: boolean },
): Promise<Market> {
  const key = `${options?.live ? "live:" : ""}${rpcUrl}:${address.toLowerCase()}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.result;
  const active = pending.get(key);
  if (active) return active;
  const request = (
    options?.live ? fetchTradingMarket(address, rpcUrl) : fetchMarket(address, rpcUrl)
  )
    .then((result) => {
      if (result.error && saved?.result.pools.length) {
        const fallback = {
          ...saved.result,
          error: "Atualização indisponível; exibindo a última consulta",
        };
        if (options?.live) cache.set(key, { result: fallback, expires: Date.now() + 2000 });
        return fallback;
      }
      if (cache.size >= 100) cache.clear();
      cache.set(key, { result, expires: Date.now() + (options?.live ? 2000 : 15_000) });
      return result;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
