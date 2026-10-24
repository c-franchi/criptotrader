import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCandles, getCandleHistoryPage } from "@/lib/history.functions";
import type { Candle } from "@/lib/marketStats";
import { candleRanges, mergeCandles, missingHistory, type TimeRange } from "@/lib/historyPaging";
const keyOf = (pool: string, token: string) =>
  `candles:${pool.toLowerCase()}:${token.toLowerCase()}`;
function readLocal(pool: string, token: string): Candle[] | undefined {
  try {
    const raw = window.localStorage.getItem(keyOf(pool, token));
    const data = raw ? JSON.parse(raw) : null;
    return Array.isArray(data) && data.length ? data : undefined;
  } catch {
    return undefined;
  }
}
function saveLocal(pool: string, token: string, data: Candle[]) {
  try {
    window.localStorage.setItem(keyOf(pool, token), JSON.stringify(data));
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
        const latest = await getCandles({ data: { pool, token } });
        const data = mergeCandles(
          client.getQueryData<Candle[]>(key) ?? readLocal(pool, token) ?? [],
          latest,
        );
        if (data.length) saveLocal(pool, token, data);
        return data;
      } catch (e) {
        const saved = client.getQueryData<Candle[]>(key) ?? readLocal(pool, token);
        if (saved?.length) return saved;
        throw e;
      }
    },
    placeholderData: () =>
      pool && typeof window !== "undefined" ? readLocal(pool, token) : undefined,
    staleTime: 30000,
    gcTime: 30 * 60000,
    refetchInterval: 30000,
    retry: 4,
    retryDelay: (n) => Math.min(2000 * 2 ** n, 15000),
  });
  const loadRange = useCallback(
    async (start: number, end: number, force = false) => {
      if (!pool || loading.current.has(scope) || !Number.isFinite(start) || !Number.isFinite(end))
        return;
      const queryKey = ["candles", pool.toLowerCase(), token.toLowerCase()];
      const current = client.getQueryData<Candle[]>(queryKey) ?? readLocal(pool, token) ?? [];
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
        client.setQueryData<Candle[]>(queryKey, (previous) => {
          const merged = mergeCandles(page, previous ?? current);
          saveLocal(pool, token, merged);
          return merged;
        });
        failures.current.delete(failureKey);
        const covered = page.length ? { start: page[0]![0] * 1000, end: before * 1000 } : gap;
        examined.current.set(scope, [...(examined.current.get(scope) ?? []), covered]);
        setStatus({ scope, loading: false, error: null, empty: !page.length });
      } catch {
        failures.current.set(failureKey, Date.now() + 20000);
        setStatus({
          scope,
          loading: false,
          error: "Não foi possível carregar as velas antigas. Os dados recebidos foram mantidos.",
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
    history: {
      loadRange,
      loading: state.loading || (!query.data && query.isFetching),
      error: state.error,
      empty: state.empty,
    },
  };
}
