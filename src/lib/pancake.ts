import { parseAbi } from "viem";

// Official PancakeSwap V2 contracts on BNB Smart Chain (docs.pancakeswap.finance → Smart contracts).
export const PANCAKE_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;
export const PANCAKE_V2_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" as const;
export const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
export const GTE = "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA" as const;
export const ZERO = "0x0000000000000000000000000000000000000000";

export const routerAbi = parseAbi([
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] path, address to, uint deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)",
]);
export const factoryAbi = parseAbi(["function getPair(address,address) view returns (address)"]);
export const pairAbi = parseAbi([
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function token0() view returns (address)",
]);
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
]);

/** amountOut * (1 - slippage%) using basis points, integer-only. */
export function minOut(quoted: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.round(slippagePct * 100));
  return (quoted * (10000n - bps)) / 10000n;
}

/** Approximate price impact (%) for a constant-product pool. */
export function priceImpactPct(amountIn: bigint, reserveIn: bigint): number {
  if (reserveIn === 0n) return 100;
  return Number((amountIn * 1_000_000n) / (reserveIn + amountIn)) / 10_000;
}
