import type { Candle } from "./marketStats";

/** Durable, server-only 5-minute OHLCV archive. Never generates synthetic prices or volume. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const seen = new Map<string, number>();
const ADDRESS = /^0x[0-9a-f]{40}$/;

async function adminClient(): Promise<any | null> {
  if (!process.env["SUPABASE_URL"]) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

/** Registration is best effort until the SQL migration is installed. */
export async function watchMarketPair(pool: string, token: string): Promise<boolean> {
  const p = pool.toLowerCase(),
    t = token.toLowerCase(),
    key = p + ":" + t;
  if (!ADDRESS.test(p) || !ADDRESS.test(t)) return false;
  if ((seen.get(key) ?? 0) > Date.now()) return true;
  const admin = await adminClient();
  if (!admin) return false;
  try {
    const { error } = await admin.rpc("watch_market_candle_pair", {
      p_pool: p,
      p_token: t,
    });
    if (error) return false;
    if (seen.size > 500) seen.clear();
    seen.set(key, Date.now() + 15 * 60_000);
    return true;
  } catch {
    return false;
  }
}

function realCandle(row: unknown): row is Candle {
  if (!Array.isArray(row) || row.length < 5 || row.length > 6) return false;
  const [ts, open, high, low, close, volume] = row;
  return (
    Number.isInteger(ts) &&
    ts > 0 &&
    [open, high, low, close].every((n) => Number.isFinite(n) && n > 0) &&
    high >= low &&
    (volume == null || (Number.isFinite(volume) && volume >= 0))
  );
}

/** Upsert true provider candles by timestamp; never replace the entire historical archive. */
export async function saveArchiveCandles(
  pool: string,
  token: string,
  candles: Candle[],
  client?: any,
): Promise<number> {
  const admin = client ?? (await adminClient());
  if (!admin) throw new Error("Banco do histórico não está configurado");
  const p = pool.toLowerCase(),
    t = token.toLowerCase();
  const bars = candles.filter(realCandle).map((c) => ({
    pool: p,
    token: t,
    ts: c[0],
    candle: c,
  }));
  if (!bars.length) return 0;
  // PostgREST upsert is idempotent and does not discard older intervals.
  for (let i = 0; i < bars.length; i += 500) {
    const { error } = await admin
      .from("market_candle_bars")
      .upsert(bars.slice(i, i + 500), { onConflict: "pool,token,ts" });
    if (error) throw new Error("Não foi possível gravar o arquivo de velas");
  }
  return bars.length;
}

/** The database, not the phone, supplies older candles after a restart or reload. */
export async function getArchivedCandles(
  pool: string,
  token: string,
  before?: number,
  limit = 1000,
  client?: any,
): Promise<Candle[]> {
  const admin = client ?? (await adminClient());
  if (!admin) return [];
  try {
    let query = admin
      .from("market_candle_bars")
      .select("candle")
      .eq("pool", pool.toLowerCase())
      .eq("token", token.toLowerCase());
    if (before != null) query = query.lt("ts", before);
    const { data, error } = await query.order("ts", { ascending: false }).limit(limit);
    if (error) return [];
    return (data ?? [])
      .map((row: { candle: unknown }) => row.candle)
      .filter(realCandle)
      .reverse();
  } catch {
    // An installation without migration continues serving the public provider.
    return [];
  }
}
