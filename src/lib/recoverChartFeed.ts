import type { ChartFeed } from "./chartFeed.server";
export type RecoveredChartFeed = ChartFeed & { refreshFailed?: boolean };
export const recentChartFeed = (feed?: ChartFeed) =>
  !!feed?.candles.length && Date.now() - feed.candles.at(-1)![0] * 1000 < 10 * 60000;

/** Return real recent OHLCV from either read transport, without waiting for a stalled server. */
export async function recoverChartFeed(
  server: () => Promise<ChartFeed>,
  direct: () => Promise<ChartFeed>,
  saved?: ChartFeed,
): Promise<RecoveredChartFeed> {
  let best = saved;
  const consider = (feed: ChartFeed) => {
    if (!best || (feed.candles.at(-1)?.[0] ?? 0) >= (best.candles.at(-1)?.[0] ?? 0)) best = feed;
    return feed;
  };
  const requireRecent = (feed: ChartFeed) => {
    consider(feed);
    if (!recentChartFeed(best)) throw new Error("Histórico ainda atrasado");
    return { ...best!, refreshFailed: false };
  };
  let startDirect!: () => void;
  let launched = false;
  const recovery = new Promise<ChartFeed>((resolve, reject) => {
    startDirect = () => {
      if (launched) return;
      launched = true;
      Promise.resolve().then(direct).then(resolve, reject);
    };
  });
  const timer = setTimeout(startDirect, 1500);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const boundedServer = Promise.race([
    Promise.resolve().then(server),
    new Promise<ChartFeed>((_, reject) => {
      deadline = setTimeout(() => reject(new Error("Servidor de histórico demorou")), 9000);
    }),
  ]);
  const primary = boundedServer.then(
    (feed) => {
      if (!recentChartFeed(feed)) startDirect();
      return feed;
    },
    (error) => {
      startDirect();
      throw error;
    },
  );
  try {
    return await Promise.any([primary.then(requireRecent), recovery.then(requireRecent)]);
  } catch {
    if (best?.candles.length) return { ...best, refreshFailed: true };
    throw new Error("Nenhuma fonte retornou velas válidas. Tente atualizar o gráfico.");
  } finally {
    clearTimeout(timer);
    clearTimeout(deadline);
  }
}
