import type { Candle } from "./marketStats";

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const cached = new Map<string, { candles: Candle[]; until: number }>();
const pending = new Map<string, Promise<Candle[]>>();
let retryAfter = 0;

/** Public, read-only pool OHLCV. No wallet, application session, API key or signing access. */
export function parseBrowserCandles(payload: unknown, token: string, now = Date.now()): Candle[] {
  const json = payload as {
    data?: { attributes?: { ohlcv_list?: unknown } };
    meta?: { base?: { address?: string }; quote?: { address?: string } };
  };
  if (!json || typeof json !== "object") throw new Error("Resposta de velas inválida");
  if (
    json.meta &&
    ![json.meta.base?.address, json.meta.quote?.address].some(
      (a) => a?.toLowerCase() === token.toLowerCase(),
    )
  )
    throw new Error("O histórico não pertence ao token selecionado");
  const rows = json.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error("Resposta de velas inválida");
  const bars = new Map<number, Candle>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [ts, open, high, low, close, volume] = row as number[];
    if (
      ts == null ||
      !Number.isSafeInteger(ts) ||
      ts <= 0 ||
      ts % 300 !== 0 ||
      ts * 1000 > now ||
      ![open, high, low, close].every(
        (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
      ) ||
      high! < Math.max(open!, close!) ||
      low! > Math.min(open!, close!) ||
      (volume != null && (!Number.isFinite(volume) || volume < 0))
    )
      continue;
    bars.set(ts, [ts, open!, high!, low!, close!, volume]);
  }
  return [...bars.values()].sort((a, b) => a[0] - b[0]);
}

/** Separate network path from the shared application server; coalesced across charts on this device. */
export async function readBrowserCandles(pool: string, token: string): Promise<Candle[]> {
  if (!ADDRESS.test(pool) || !ADDRESS.test(token)) throw new Error("Mercado inválido");
  const key = `${pool.toLowerCase()}:${token.toLowerCase()}`;
  const saved = cached.get(key);
  if (saved && saved.until > Date.now()) return saved.candles;
  const active = pending.get(key);
  if (active) return active;
  if (Date.now() < retryAfter) throw new Error("Aguardando limite da fonte de velas");
  const request = (async () => {
    const url = new URL(
      `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pool.toLowerCase()}/ohlcv/minute`,
    );
    url.search = new URLSearchParams({
      aggregate: "5",
      limit: "300",
      currency: "usd",
      token: token.toLowerCase(),
      include_empty_intervals: "true",
    }).toString();
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      retryAfter =
        Date.now() +
        Math.min(300000, Math.max(60000, Number.isFinite(seconds) ? seconds * 1000 : 90000));
    }
    if (!response.ok) throw new Error(`Fonte de velas indisponível (${response.status})`);
    const candles = parseBrowserCandles(await response.json(), token);
    if (!candles.length) throw new Error("Fonte não retornou velas válidas");
    if (cached.size >= 100) cached.clear();
    cached.set(key, { candles, until: Date.now() + 60000 });
    return candles;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
