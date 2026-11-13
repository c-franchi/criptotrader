import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getChartFeed, getCandleHistoryPage } from "@/lib/history.functions";
import type { ChartFeed } from "@/lib/chartFeed.server";
import type { Candle } from "@/lib/marketStats";
import { candleRanges, mergeCandles, missingHistory, type TimeRange } from "@/lib/historyPaging";
type CachedFeed = ChartFeed & { refreshFailed?: boolean };
const keyOf = (pool: string, token: string) =>
  `candles:${pool.toLowerCase()}:${token.toLowerCase()}`;
function readLocal(pool: string, token: string): ChartFeed | undefined {
  try {
    const raw = window.localStorage.getItem(keyOf(pool, token));
    const value: unknown = raw ? JSON.parse(raw) : null;
    // Backward compatibility: existing mobile installations stored a bare list.
    if (Array.isArray(value) && value.length) return { source: "gecko", candles: value };
    if (value && typeof value === "object") {
      const feed = value as Partial<ChartFeed>;
      if (
        (feed.source === "gecko" || feed.source === "dexpaprika") &&
        Array.isArray(feed.candles) &&
        feed.candles.length
      )
        return { source: feed.source, candles: feed.candles };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
function saveLocal(pool: string, token: string, feed: ChartFeed) {
  try {
    window.localStorage.setItem(keyOf(pool, token), JSON.stringify(feed));
  } catch {
    /* Memory cache keeps older pages if device storage is full. */
  }
}
/** Recent refresh and on-demand historical pages share data, never replace each other. */
export function useCandles(pool: string | undefined, token: string) {
  const client = useQueryClient();
  const key = ["candles", pool?.toLowerCase(), token.toLowerCase()];
  const scope = `${pool?.toLowerCase()}:${token.toLowerCase()}`;
  const loading = useRef(new Set<string>());
  const failures = useRef(new Map<string, number>());
  const examined = useRef(new Map<string, TimeRange[]>());
  const [status, setStatus] = useState<{
    scope: string;
    loading: boolean;
    error: string | null;
    empty: boolean;
  }>({ scope: "", loading: false, error: null, empty: false });
  const query = useQuery({
    queryKey: key,
    enabled: !!pool,
    queryFn: async () => {
      if (!pool) throw Error("Pool indisponível");
      try {
        const latest = await getChartFeed({ data: { pool, token } });
        const saved = client.getQueryData<CachedFeed>(key) ?? readLocal(pool, token);
        if (!latest.candles.length) throw new Error("Fonte não retornou velas recentes");
        // Never splice OHLCV from a different provider's price methodology.
        const candles =
          saved?.source === latest.source
            ? mergeCandles(saved.candles, latest.candles)
            : latest.candles;
        const feed: CachedFeed = { ...latest, candles, refreshFailed: false };
        if (candles.length) saveLocal(pool, token, feed);
        return feed;
      } catch (e) {
        const saved = client.getQueryData<ChartFeed>(key) ?? readLocal(pool, token);
        if (saved?.candles.length) return { ...saved, refreshFailed: true } as CachedFeed;
        throw e;
      }
    },
    placeholderData: () =>
      pool && typeof window !== "undefined" ? readLocal(pool, token) : undefined,
    staleTime: 60000,
    gcTime: 30 * 60000,
    refetchInterval: 60000,
    retry: 2,
    retryDelay: (n) => Math.min(5000 * 2 ** n, 30000),
  });
  const loadRange = useCallback(
    async (start: number, end: number, force = false) => {
      if (!pool || loading.current.has(scope) || !Number.isFinite(start) || !Number.isFinite(end))
        return;
      const queryKey = ["candles", pool.toLowerCase(), token.toLowerCase()];
      const feed = client.getQueryData<ChartFeed>(queryKey) ?? readLocal(pool, token);
      // GeckoTerminal archive pages are pool candles; DexPaprika's aggregated
      // token candles must never be combined with them.
      if (feed?.source === "dexpaprika") return;
      const current = feed?.candles ?? [];
      const gap = missingHistory(start, Math.min(end, Date.now()), [
        ...candleRanges(current),
        ...(examined.current.get(scope) ?? []),
      ]);
      if (!gap) {
        setStatus((previous) =>
          previous.scope === scope &&
          previous.empty &&
          !missingHistory(start, Math.min(end, Date.now()), candleRanges(current))
            ? { ...previous, empty: false }
            : previous,
        );
        return;
      }
      if (gap.end <= 0) return;
      const before = Math.ceil(gap.end / 300000) * 300;
      const failureKey = `${scope}:${before}`;
      if (!force && (failures.current.get(failureKey) ?? 0) > Date.now()) return;
      loading.current.add(scope);
      setStatus({ scope, loading: true, error: null, empty: false });
      try {
        const page = await client.fetchQuery({
          queryKey: ["candle-history-page", pool.toLowerCase(), token.toLowerCase(), before],
          queryFn: () => getCandleHistoryPage({ data: { pool, token, before } }),
          staleTime: 15 * 60000,
          retry: false,
        });
        // Historical evidence cannot overwrite a newer live refresh at the same timestamp.
        client.setQueryData<ChartFeed>(queryKey, (previous) => {
          if (previous?.source === "dexpaprika") return previous;
          const merged = mergeCandles(page, previous?.candles ?? current);
          const next: CachedFeed = { ...previous, source: "gecko", candles: merged };
          saveLocal(pool, token, next);
          return next;
        });
        failures.current.delete(failureKey);
        const covered = page.length ? { start: page[0]![0] * 1000, end: before * 1000 } : gap;
        examined.current.set(scope, [...(examined.current.get(scope) ?? []), covered]);
        setStatus({ scope, loading: false, error: null, empty: !page.length });
      } catch {
        failures.current.set(failureKey, Date.now() + 2 * 60_000);
        setStatus({
          scope,
          loading: false,
          error:
            "Fonte de histórico temporariamente indisponível. As velas salvas continuam visíveis; nova tentativa automática mais tarde.",
          empty: false,
        });
      } finally {
        loading.current.delete(scope);
      }
    },
    [pool, token, scope, client],
  );
  const state = status.scope === scope ? status : { loading: false, error: null, empty: false };
  return {
    ...query,
    data: query.data?.candles,
    source: query.data?.source ?? null,
    refreshFailed: (query.data as CachedFeed | undefined)?.refreshFailed ?? false,
    history: {
      refreshRecent: () => {
        void query.refetch();
      },
      refreshingRecent: query.isFetching,
      refreshFailed: (query.data as CachedFeed | undefined)?.refreshFailed ?? query.isError,
      loadRange,
      loading: state.loading || (!query.data && query.isFetching),
      error: query.data?.source === "dexpaprika" ? null : state.error,
      empty: query.data?.source === "dexpaprika" ? false : state.empty,
    },
  };
}
