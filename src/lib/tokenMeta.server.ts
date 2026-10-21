import { createPublicClient, getAddress, http, parseAbi } from "viem";
import { bsc } from "viem/chains";
import { findToken, type TokenInfo } from "./tokens";

const metaAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const cache = new Map<string, TokenInfo>();

export const metaClient = (
  rpc = process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org",
) => createPublicClient({ chain: bsc, transport: http(rpc, { timeout: 8000, retryCount: 1 }) });

/** Reads name/symbol/decimals on-chain for any BEP-20 (built-in list first). Throws if it is not a token. */
export async function tokenMeta(address: string): Promise<TokenInfo> {
  const known = findToken(address);
  if (known) return known;
  const addr = getAddress(address);
  const hit = cache.get(addr);
  if (hit) return hit;
  const c = metaClient();
  const [name, symbol, decimals] = await Promise.all([
    c.readContract({ address: addr, abi: metaAbi, functionName: "name" }),
    c.readContract({ address: addr, abi: metaAbi, functionName: "symbol" }),
    c.readContract({ address: addr, abi: metaAbi, functionName: "decimals" }),
  ]);
  const info: TokenInfo = {
    address: addr,
    name: String(name).slice(0, 60),
    symbol: String(symbol).slice(0, 20),
    decimals: Number(decimals),
  };
  cache.set(addr, info);
  return info;
}
