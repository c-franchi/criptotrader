import type { Candle } from "@/lib/marketStats";
import { Button } from "./ui/button";

/** Freshness belongs to the OHLC feed, independent from a live spot-price marker. */
export function ChartHistoryStatus({
  candles,
  now,
  refreshError,
  refreshing,
  onRefresh,
}: {
  candles: Candle[];
  now: number;
  refreshError?: boolean | undefined;
  refreshing?: boolean | undefined;
  onRefresh?: (() => void) | undefined;
}) {
  const last = candles.at(-1);
  const at = last ? last[0] * 1000 : null;
  const stale = at != null && now - (at + 300_000) > 15 * 60_000;
  if (!stale && !refreshError) return null;
  return (
    <div
      data-history-status
      role="status"
      className="space-y-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm"
    >
      <p className="font-semibold">
        {stale ? "Histórico desatualizado" : "Não foi possível atualizar o histórico"}
      </p>
      {at != null && (
        <p>Última vela de 5m: {new Date(at).toLocaleString("pt-BR")} (abertura, horário local).</p>
      )}
      <p>
        A cotação laranja é consultada separadamente. O período sem velas não é preenchido com
        preços estimados.
      </p>
      {onRefresh && (
        <Button type="button" size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? "Atualizando histórico…" : "Atualizar histórico"}
        </Button>
      )}
    </div>
  );
}
