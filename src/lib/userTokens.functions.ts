import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { POPULAR_BSC_TOKENS } from "./tokens";

const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

/** Validates an address on-chain as a BEP-20 and returns its metadata. */
export const inspectToken = createServerFn({ method: "GET" })
  .inputValidator((d: { address: string }) => z.object({ address: addr }).parse(d))
  .handler(async ({ data }) => {
    const { tokenMeta } = await import("./tokenMeta.server");
    try {
      return { token: await tokenMeta(data.address), error: null };
    } catch {
      return { token: null, error: "Esse endereço não é um token BEP-20 na BSC." };
    }
  });

export type WalletToken = { address: `0x${string}`; symbol: string; name: string; decimals: number; balance: string };

/**
 * Checks the wallet balance of the built-in, popular and extra (saved) tokens.
 * Free BSC data sources cannot list every token of a wallet, so unknown tokens must be added by address.
 */
export const scanWallet = createServerFn({ method: "POST" })
  .inputValidator((d: { wallet: string; extra?: string[] }) => z.object({ wallet: addr, extra: z.array(addr).max(50).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { tokenMeta, metaClient } = await import("./tokenMeta.server");
    const { erc20Abi } = await import("./pancake");
    const { formatUnits, getAddress } = await import("viem");
    const list = [...new Set([...POPULAR_BSC_TOKENS, ...(data.extra ?? [])].map((a) => getAddress(a)))];
    const c = metaClient();
    const wallet = getAddress(data.wallet);
    const res = await c.multicall({
      contracts: list.map((a) => ({ address: a, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }) as const),
      allowFailure: true,
    });
    const out: WalletToken[] = [];
    await Promise.all(list.map(async (a, i) => {
      const r = res[i];
      if (!r || r.status !== "success" || (r.result as bigint) === 0n) return;
      try {
        const m = await tokenMeta(a);
        out.push({ ...m, balance: formatUnits(r.result as bigint, m.decimals) });
      } catch { /* not a readable token */ }
    }));
    const bnb = formatUnits(await c.getBalance({ address: wallet }), 18);
    return { bnb, tokens: out.sort((x, y) => x.symbol.localeCompare(y.symbol)), checked: list.length };
  });

/** Measures a token's buy/sell tax by simulating a tiny swap on-chain (nothing is sent). */
export const getTokenTax = createServerFn({ method: "GET" })
  .inputValidator((d: { address: string }) => z.object({ address: addr }).parse(d))
  .handler(async ({ data }) => {
    const { detectTax } = await import("./taxDetect.server");
    try {
      return { tax: await detectTax(data.address, process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org"), error: null };
    } catch {
      return { tax: null, error: "Não foi possível medir a taxa (o token pode não ter par com BNB na PancakeSwap V2 ou bloquear vendas)." };
    }
  });
