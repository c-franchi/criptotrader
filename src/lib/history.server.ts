import type { Candle } from "./backtest";

const cache = new Map<string, { candles: Candle[]; expires: number }>();
const pending = new Map<string, Promise<Candle[]>>();
const failures = new Map<string, number>();

/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<any | null> {
  try {
    if (!process.env["SUPABASE_URL"]) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

/** Last good candles saved in the database — survives server restarts and outages of the public source. */
async function savedCandles(pool: string, token: string): Promise<Candle[] | null> {
  try {
    const admin = await db();
    if (!admin) return null;
    const { data } = await admin
      .from("price_candles")
      .select("candles")
      .eq("pool", pool)
      .eq("token", token)
      .maybeSingle();
    return Array.isArray(data?.candles) && data.candles.length ? (data.candles as Candle[]) : null;
  } catch {
    return null;
  }
}
async function saveCandles(pool: string, token: string, candles: Candle[]) {
  try {
    const admin = await db();
    if (admin && candles.length)
      await admin
        .from("price_candles")
        .upsert({ pool, token, candles, updated_at: new Date().toISOString() });
  } catch {
    /* cache only */
  }
}

async function fetchGecko(pool: string, token?: string): Promise<Candle[]> {
  const url = new URL(
    `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pool}/ohlcv/minute`,
  );
  url.search = new URLSearchParams({
    aggregate: "5",
    limit: "300",
    currency: "usd",
    token: token ?? "base",
    include_empty_intervals: "true",
  }).toString();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "CryptoBot/1.0" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`Histórico indisponível (${res.status})`);
      const json = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
      const list = json.data?.attributes?.ohlcv_list;
      if (!Array.isArray(list)) throw new Error("Histórico inválido");
      return list
        .filter(
          (x) =>
            x.length >= 5 &&
            x.slice(0, 5).every(Number.isFinite) &&
            x.slice(1, 5).every((n) => n > 0),
        )
        .map((x): Candle =>
          x[5] != null && Number.isFinite(x[5]) && x[5] >= 0
            ? [Number(x[0]), Number(x[1]), Number(x[2]), Number(x[3]), Number(x[4]), Number(x[5])]
            : [Number(x[0]), Number(x[1]), Number(x[2]), Number(x[3]), Number(x[4])],
        )
        .sort((a, b) => a[0] - b[0]);
    } catch (e) {
      lastError = e;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Histórico indisponível");
}

/** Coalesce public history reads; failed refreshes never replace good data (memory, then database). */
export async function readCandles(pool: string, token?: string): Promise<Candle[]> {
  const p = pool.toLowerCase(),
    t = token?.toLowerCase() ?? "base";
  const key = `${p}:${t}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.candles;
  const active = pending.get(key);
  if (active) return active;
  const request = (async () => {
    if ((failures.get(key) ?? 0) <= Date.now()) {
      try {
        const candles = await fetchGecko(pool, token);
        if (!candles.length) throw new Error("Histórico vazio");
        if (cache.size >= 100) {
          cache.clear();
          failures.clear();
        }
        cache.set(key, { candles, expires: Date.now() + 60_000 });
        failures.delete(key);
        if (candles.length) await saveCandles(p, t, candles);
        return candles;
      } catch {
        failures.set(key, Date.now() + 20_000);
      }
    }
    if (saved?.candles.length) return saved.candles;
    const stored = await savedCandles(p, t);
    if (stored) {
      cache.set(key, { candles: stored, expires: Date.now() + 15_000 });
      return stored;
    }
    throw new Error("Fonte de histórico temporariamente indisponível");
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
