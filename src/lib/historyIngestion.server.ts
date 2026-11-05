import { fetchGecko } from "./history.server";
import { saveArchiveCandles } from "./marketHistoryArchive.server";
import type { Candle } from "./marketStats";

/** Cron-only: save real OHLCV even with every browser and PWA closed.
 * Isolated from grid-tick, the wallet mutex, signing and trade decisions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function tickMarketHistory(admin: any) {
  const { data: work, error } = await admin.rpc("claim_market_candle_pairs", {
    p_limit: 2,
  });
  if (error) throw new Error("Arquivo persistente não instalado: aplique a migração 0022");
  let saved = 0,
    failed = 0,
    backfilled = 0;
  for (const pair of (work ?? []) as {
    pool: string;
    token: string;
    backfill_before: number | null;
    backfill_complete: boolean;
  }[]) {
    const pool = pair.pool.toLowerCase(),
      token = pair.token.toLowerCase();
    try {
      // At most one short public API request to refresh this watched pool.
      const recent = await fetchGecko(pool, token, true);
      if (!recent.length) throw new Error("A fonte não retornou velas recentes");
      const written = await saveArchiveCandles(pool, token, recent, admin);
      if (!written) throw new Error("Nenhuma vela válida recebida");
      saved += written;
      let cursor = pair.backfill_before ?? recent[0]![0];
      let complete = pair.backfill_complete;
      let backfillError: string | null = null;
      // Opportunistic recovery: one older page per cycle, never unbounded crawling.
      if (!complete) {
        try {
          const older = (await fetchGecko(pool, token, false, cursor)).filter(
            (c: Candle) => c[0] < cursor,
          );
          if (older.length) {
            backfilled += await saveArchiveCandles(pool, token, older, admin);
            cursor = older[0]![0];
          } else {
            complete = true; // provider has no older candles for this pool
          }
        } catch {
          // Backfill is best effort; fresh candles remain safely committed.
          backfillError = "Histórico antigo pendente de recuperação";
        }
      }
      const { error: updateError } = await admin
        .from("market_candle_watch")
        .update({
          last_success_at: new Date().toISOString(),
          last_candle_at: recent.at(-1)![0],
          next_run_at: new Date(Date.now() + 2 * 60_000).toISOString(),
          backfill_before: cursor,
          backfill_complete: complete,
          last_error: backfillError,
        })
        .eq("pool", pool)
        .eq("token", token);
      if (updateError) throw new Error("Falha ao atualizar o monitoramento");
    } catch (caught) {
      failed++;
      const message = caught instanceof Error ? caught.message : "Erro na fonte";
      await admin
        .from("market_candle_watch")
        .update({
          last_error: message.slice(0, 180),
          next_run_at: new Date(
            Date.now() + (/429|limitad|Limite/i.test(message) ? 10 : 3) * 60_000,
          ).toISOString(),
        })
        .eq("pool", pool)
        .eq("token", token);
    }
  }
  const status = { claimed: (work ?? []).length, saved, backfilled, failed };
  // A visible heartbeat distinguishes an active server cron from a closed browser.
  await admin.from("market_candle_heartbeat").upsert({
    id: 1,
    last_invoked_at: new Date().toISOString(),
    last_success_at: failed === 0 ? new Date().toISOString() : null,
    ...status,
  });
  return status;
}
