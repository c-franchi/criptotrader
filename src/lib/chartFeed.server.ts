import type { Candle } from "./marketStats";
import { readCandles } from "./history.server";

/**
 * Secondary, chart-only USD candles. DexPaprika token OHLCV is a volume-weighted
 * series across the token's pools, NOT the execution pool's quote. Never pass
 * these bars to strategyBot, archive tables, or a trading decision.
 *
 * 5m token OHLCV needs a paid DexPaprika Dev/Pro key; the free tiers don't
 * provide the same granularity and must not be mislabeled as 5m candles.
 */
export type ChartFeed = { source: "gecko" | "dexpaprika"; candles: Candle[] };
const address = /^0x[0-9a-f]{40}$/i;

function validBar(c: Candle, nowSeconds: number) {
  return (
    Number.isSafeInteger(c[0]) &&
    c[0] > 0 &&
    c[0] % 300 === 0 &&
    c[0] <= nowSeconds + 300 &&
    [c[1], c[2], c[3], c[4]].every((x) => Number.isFinite(x) && x > 0) &&
    c[2] >= Math.max(c[1], c[4]) &&
    c[3] <= Math.min(c[1], c[4]) &&
    (c[5] === undefined || (Number.isFinite(c[5]) && c[5] >= 0))
  );
}

export function parseDexPaprikaCandles(input: unknown, nowSeconds = Math.floor(Date.now() / 1000)): Candle[] {
  if (!Array.isArray(input)) throw new Error("DexPaprika: formato OHLCV inválido");
  const sorted = new Map<number, Candle>();
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const time = typeof obj.time_open === "string" ? Date.parse(obj.time_open) / 1000 : NaN;
    const open = Number(obj.open);
    const high = Number(obj.high);
    const low = Number(obj.low);
    const close = Number(obj.close);
    const volume = obj.volume == null ? undefined : Number(obj.volume);
    const bar: Candle = [time, open, high, low, close, volume];
    if (validBar(bar, nowSeconds)) sorted.set(time, bar);
  }
  return [...sorted.values()].sort((a, b) => a[0] - b[0]);
}

export async function fetchDexPaprikaChart(token: string): Promise<Candle[]> {
  const key = process.env["DEXPAPRIKA_API_KEY"]?.trim();
  if (!key || !address.test(token)) throw new Error("Fonte alternativa de 5m não configurada");
  const url = new URL(
    `https://api-pro.dexpaprika.com/networks/bsc/tokens/${token.toLowerCase()}/ohlcv`,
  );
  url.search = new URLSearchParams({
    start: "-25h",
    interval: "5m",
    limit: "300",
  }).toString();
  const result = await fetch(url, {
    headers: { accept: "application/json", Authorization: key },
    signal: AbortSignal.timeout(6_000),
  });
  if (!result.ok) throw new Error("DexPaprika: dados indisponíveis ou plano incompatível");
  const bars = parseDexPaprikaCandles(await result.json());
  if (!bars.length) throw new Error("DexPaprika: nenhuma vela comprovada");
  return bars;
}

export async function readChartFeed(pool: string, token: string): Promise<ChartFeed> {
  // Fast read: don't keep a mobile screen in the long public-provider retry queue.
  // Even when GeckoTerminal is throttled, prior legitimate pool bars stay intact.
  let primary: Candle[] = [];
  let primaryFailed = false;
  try {
    primary = await readCandles(pool, token, { fast: true });
  } catch {
    primaryFailed = true;
  }
  const latest = primary.at(-1)?.[0] ?? 0;
  const isRecent = latest > 0 && Date.now() - latest * 1000 < 20 * 60_000;
  if (isRecent || !process.env["DEXPAPRIKA_API_KEY"]) {
    if (primary.length) return { source: "gecko", candles: primary };
    throw new Error("Histórico de velas ainda não disponível");
  }
  try {
    const backup = await fetchDexPaprikaChart(token);
    // Fall back only when the independent token-level series is demonstrably
    // NEWER. Never splice weighted token OHLCV into a pool-specific series.
    if (backup.at(-1)![0] > latest + 300)
      return { source: "dexpaprika", candles: backup };
  } catch {
    // Last verified pool candles remain available if the secondary source fails.
  }
  if (primary.length) return { source: "gecko", candles: primary };
  throw new Error(
    primaryFailed ? "As fontes de histórico ainda não responderam" : "Histórico não localizado",
  );
}
