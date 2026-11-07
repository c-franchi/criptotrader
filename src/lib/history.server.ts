import type { Candle } from "./marketStats";
import { mergeCandles } from "./historyPaging";
import { getArchivedCandles, saveArchiveCandles } from "./marketHistoryArchive.server";

const cache = new Map<string, { candles: Candle[]; expires: number }>();
const pending = new Map<string, Promise<Candle[]>>();
const failures = new Map<string, number>();
// GeckoTerminal's free OHLC endpoint has a shared rate limit and 1-minute caching.
// A 429 pauses requests across tokens in this instance instead of amplifying an outage.
let geckoBlockedUntil = 0;
const GECKO_CACHE_MS = 75_000;

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
export async function saveCandles(pool: string, token: string, candles: Candle[]) {
  try {
    const admin = await db();
    if (admin && candles.length)
      await admin
        .from("price_candles")
        .upsert({ pool, token, candles, updated_at: new Date().toISOString() });
  } catch {
    /* The recent snapshot is a fallback; archiving is attempted separately. */
  }
  // The archive is append/upsert only, not a replacement of the previous day.
  await saveArchiveCandles(pool, token, candles).catch(() => {});
}

export async function fetchGecko(
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
  if (Date.now() < geckoBlockedUntil)
    throw new Error("Histórico temporariamente limitado pela fonte");
  for (let attempt = 0; attempt < (fast || before != null ? 1 : 3); attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json;version=20230203",
          "user-agent": "CryptoBot/1.0",
        },
        // Server-side background collection is a single attempt; 1.5s caused
        // avoidable timeouts on the public, minute-cached GeckoTerminal API.
        // Keep it bounded below the scheduler's HTTP timeout.
        signal: AbortSignal.timeout(fast ? 6_000 : 8_000),
      });
      if (res.status === 429) {
        const header = res.headers?.get("retry-after");
        const retrySeconds = header && /^[0-9]+$/.test(header) ? Number(header) : 90;
        const waitMs = Math.min(300_000, Math.max(60_000, retrySeconds * 1000));
        geckoBlockedUntil = Math.max(geckoBlockedUntil, Date.now() + waitMs);
        throw new Error("Histórico indisponível (429): limite de consultas; aguardando a fonte");
      }
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
      if (Date.now() < geckoBlockedUntil) break; // Never retry a 429 in the same call.
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
    if ((failures.get(requestKey) ?? 0) <= Date.now() && Date.now() >= geckoBlockedUntil) {
      try {
        const candles = await fetchGecko(pool, token, options?.fast);
        if (!candles.length) throw new Error("Histórico vazio");
        if (cache.size >= 100) {
          cache.clear();
          failures.clear();
        }
        cache.set(key, { candles, expires: Date.now() + GECKO_CACHE_MS });
        failures.delete(requestKey);
        if (candles.length) await saveCandles(p, t, candles);
        return candles;
      } catch {
        failures.set(requestKey, Math.max(Date.now() + 20_000, geckoBlockedUntil));
      }
    }
    if (saved?.candles.length) return saved.candles;
    const [stored, archived] = await Promise.all([
      savedCandles(p, t),
      getArchivedCandles(p, t, undefined, 400),
    ]);
    const preserved = mergeCandles(archived, stored ?? []);
    if (preserved.length) {
      cache.set(key, { candles: preserved, expires: Date.now() + 15_000 });
      return preserved;
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
  const cursor = Math.min(Math.ceil(before / 300) * 300, Math.floor(Date.now() / 1000));
  const key = `${pool.toLowerCase()}:${token?.toLowerCase() ?? "base"}:${cursor}`;
  const saved = olderCache.get(key);
  if (saved && saved.expires > Date.now()) return saved.candles;
  const active = olderPending.get(key);
  if (active) return active;
  const request = (async () => {
    // Try the durable archive before consuming GeckoTerminal public API quota.
    const archived = await getArchivedCandles(pool, token ?? "base", cursor, 1000);
    if (archived.length >= 1000) return archived;
    let fetched: Candle[] = [];
    try {
      fetched = (await fetchGecko(pool, token, false, cursor)).filter((c) => c[0] < cursor);
      if (fetched.length) await saveArchiveCandles(pool, token ?? "base", fetched).catch(() => {});
    } catch (error) {
      // Cached real bars remain visible during provider rate limits/outages.
      if (!archived.length) throw error;
    }
    const candles = mergeCandles(archived, fetched)
      .filter((c) => c[0] < cursor)
      .slice(-1000);
    if (olderCache.size >= 200) olderCache.clear();
    olderCache.set(key, { candles, expires: Date.now() + 15 * 60000 });
    return candles;
  })().finally(() => olderPending.delete(key));
  olderPending.set(key, request);
  return request;
}
