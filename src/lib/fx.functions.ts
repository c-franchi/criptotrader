import { createServerFn } from "@tanstack/react-start";
import { createPublicClient, formatEther, http, isAddress } from "viem";
import { bsc } from "viem/chains";

const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const RPC = process.env["BSC_RPC_URL"] || "https://bsc-rpc.publicnode.com";

export type FxQuote = {
  bnbUsd: number | null;
  usdBrl: number | null;
  usdEur?: number | null;
  at: number;
};

let cache: { q: FxQuote; until: number } | null = null;
let pending: Promise<FxQuote> | null = null;

async function fetchQuote(): Promise<FxQuote> {
  const [bnbRes, brlRes] = await Promise.allSettled([
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${WBNB}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
    fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
  ]);
  let bnbUsd =
    bnbRes.status === "fulfilled"
      ? (bnbRes.value?.pairs?.find(
          (p: { chainId?: string; priceUsd?: string }) => p.chainId === "bsc" && p.priceUsd,
        )?.priceUsd ?? null)
      : null;
  if (!(Number(bnbUsd) > 0)) {
    try {
      const { bnbUsdPrice } = await import("./market.server");
      bnbUsd = await bnbUsdPrice(
        createPublicClient({ chain: bsc, transport: http(RPC, { timeout: 5000, retryCount: 0 }) }),
      );
    } catch {
      bnbUsd = null;
    }
  }
  const usdBrl = brlRes.status === "fulfilled" ? (brlRes.value?.rates?.BRL ?? null) : null;
  return {
    bnbUsd: Number.isFinite(Number(bnbUsd)) && Number(bnbUsd) > 0 ? Number(bnbUsd) : null,
    usdBrl: usdBrl === null ? null : Number(usdBrl),
    usdEur: brlRes.status === "fulfilled" ? Number(brlRes.value?.rates?.EUR) || null : null,
    at: Date.now(),
  };
}

/** Cotação BNB→USD e USD→BRL, com cache de 60s. Métricas indisponíveis voltam null. */
export const getFxQuote = createServerFn({ method: "GET" }).handler(async (): Promise<FxQuote> => {
  if (cache && cache.until > Date.now()) return cache.q;
  if (!pending) {
    pending = fetchQuote()
      .then((q) => {
        cache = { q, until: Date.now() + 60_000 };
        return q;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
});

/** Saldo de BNB de uma carteira, lido direto da rede (dado público). */
export const getBnbBalance = createServerFn({ method: "GET" })
  .inputValidator((d: { address: string }) => {
    if (!d?.address || !isAddress(d.address)) throw new Error("Endereço inválido");
    return { address: d.address as `0x${string}` };
  })
  .handler(async ({ data }): Promise<string> => {
    const pub = createPublicClient({ chain: bsc, transport: http(RPC) });
    return formatEther(await pub.getBalance({ address: data.address }));
  });
