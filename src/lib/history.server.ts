import type { Candle } from "./marketStats";

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

async function fetchGecko(
  pool: string,
  token?: string,
  fast = false,
  before?: number,
): Promise<Candle[]> {
  const url = new URL(
    `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pool}/ohlcv/minute`,
  );
  url.search = new URLSearchParams({
    aggregate: "5",
    limit: before != null ? "1000" : "300",
    currency: "usd",
    token: token ?? "base",
    include_empty_intervals: "true",
  }).toString();
  if (before != null) url.searchParams.set("before_timestamp", String(before));
  let lastError: unknown;
  for (let attempt = 0; attempt < (fast || before != null ? 1 : 3); attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "CryptoBot/1.0" },
        signal: AbortSignal.timeout(fast ? 1_500 : 8_000),
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
      if (!fast && before == null && attempt < 2)
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Histórico indisponível");
}

/** Coalesce public history reads; failed refreshes never replace good data (memory, then database). */
export async function readCandles(
  pool: string,
  token?: string,
  options?: { fast?: boolean },
): Promise<Candle[]> {
  const p = pool.toLowerCase(),
    t = token?.toLowerCase() ?? "base";
  const key = `${p}:${t}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.candles;
  // A robot must not join the chart's potentially long retry queue.
  const requestKey = options?.fast ? `fast:${key}` : key;
  const active = pending.get(requestKey);
  if (active) return active;
  const request = (async () => {
    if ((failures.get(requestKey) ?? 0) <= Date.now()) {
      try {
        const candles = await fetchGecko(pool, token, options?.fast);
        if (!candles.length) throw new Error("Histórico vazio");
        if (cache.size >= 100) {
          cache.clear();
          failures.clear();
        }
        cache.set(key, { candles, expires: Date.now() + 30_000 });
        failures.delete(requestKey);
        if (candles.length) await saveCandles(p, t, candles);
        return candles;
      } catch {
        failures.set(requestKey, Date.now() + 20_000);
      }
    }
    if (saved?.candles.length) return saved.candles;
    const stored = await savedCandles(p, t);
    if (stored) {
      cache.set(key, { candles: stored, expires: Date.now() + 15_000 });
      return stored;
    }
    throw new Error("Fonte de histórico temporariamente indisponível");
  })().finally(() => pending.delete(requestKey));
  pending.set(requestKey, request);
  return request;
}

// Older chart pages never enter the latest/robot cache or overwrite its saved snapshot.
const olderCache = new Map<string, { candles: Candle[]; expires: number }>();
const olderPending = new Map<string, Promise<Candle[]>>();
export async function readCandleHistoryPage(
  pool: string,
  token: string | undefined,
  before: number,
): Promise<Candle[]> {
  const cursor = Math.min(Math.ceil(before / 300) * 300, Math.ceil(Date.now() / 300000) * 300);
  const key = `${pool.toLowerCase()}:${token?.toLowerCase() ?? "base"}:${cursor}`;
  const saved = olderCache.get(key);
  if (saved && saved.expires > Date.now()) return saved.candles;
  const active = olderPending.get(key);
  if (active) return active;
  const request = fetchGecko(pool, token, false, cursor)
    .then((rows) => {
      const candles = rows.filter((c) => c[0] < cursor);
      if (olderCache.size >= 200) olderCache.clear();
      olderCache.set(key, { candles, expires: Date.now() + 15 * 60000 });
      return candles;
    })
    .finally(() => olderPending.delete(key));
  olderPending.set(key, request);
  return request;
}
