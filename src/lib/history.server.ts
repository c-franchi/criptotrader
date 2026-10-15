import type { Candle } from "./backtest";

const cache = new Map<string, { candles: Candle[]; expires: number }>();
const pending = new Map<string, Promise<Candle[]>>();
const failures = new Map<string, number>();

/** Coalesce public history reads; failed refreshes never replace good data. */
export async function readCandles(pool: string, token?: string): Promise<Candle[]> {
  const key = `${pool.toLowerCase()}:${token?.toLowerCase() ?? "base"}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.candles;
  const active = pending.get(key);
  if (active) return active;
  if ((failures.get(key) ?? 0) > Date.now()) throw new Error("Fonte de histórico temporariamente indisponível");
  const request = (async () => {
    const url = new URL(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pool}/ohlcv/minute`);
    url.search = new URLSearchParams({ aggregate: "5", limit: "300", currency: "usd", token: token ?? "base", include_empty_intervals: "true" }).toString();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error("Histórico indisponível");
        const json = await res.json() as { data?: { attributes?: { ohlcv_list?: number[][] } } };
        const list = json.data?.attributes?.ohlcv_list;
        if (!Array.isArray(list)) throw new Error("Histórico inválido");
        const candles = list.filter((x) => x.length >= 5 && x.slice(0, 5).every(Number.isFinite) && x.slice(1, 5).every((n) => n > 0))
          .map((x): Candle => [Number(x[0]), Number(x[1]), Number(x[2]), Number(x[3]), Number(x[4])]).sort((a, b) => a[0] - b[0]);
        if (cache.size >= 100) { cache.clear(); failures.clear(); }
        cache.set(key, { candles, expires: Date.now() + 60_000 });
        failures.delete(key);
        return candles;
      } catch {
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    failures.set(key, Date.now() + 30_000);
    throw new Error("Fonte de histórico temporariamente indisponível");
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}