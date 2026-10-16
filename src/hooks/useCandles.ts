import { useQuery } from "@tanstack/react-query";
import { getCandles } from "@/lib/history.functions";
import type { Candle } from "@/lib/backtest";

const keyOf = (pool: string, token: string) => `candles:${pool.toLowerCase()}:${token.toLowerCase()}`;

function readLocal(pool: string, token: string): Candle[] | undefined {
  try {
    const raw = window.localStorage.getItem(keyOf(pool, token));
    const v = raw ? (JSON.parse(raw) as Candle[]) : undefined;
    return Array.isArray(v) && v.length ? v : undefined;
  } catch { return undefined; }
}

/**
 * Price history shared by every chart: retries with backoff, keeps the last good
 * list on this device so the chart shows instantly and survives source outages.
 */
export function useCandles(pool: string | undefined, token: string) {
  return useQuery({
    queryKey: ["candles", pool?.toLowerCase(), token.toLowerCase()],
    enabled: !!pool,
    queryFn: async () => {
      if (!pool) throw new Error("Pool indisponível");
      try {
        const data = await getCandles({ data: { pool, token } });
        if (data.length) try { window.localStorage.setItem(keyOf(pool, token), JSON.stringify(data)); } catch { /* storage full */ }
        return data;
      } catch (e) {
        const local = readLocal(pool, token);
        if (local) return local;
        throw e;
      }
    },
    placeholderData: () => (pool && typeof window !== "undefined" ? readLocal(pool, token) : undefined),
    staleTime: 60_000, gcTime: 30 * 60_000, refetchInterval: 60_000,
    retry: 4, retryDelay: (n) => Math.min(2000 * 2 ** n, 15_000),
  });
}
