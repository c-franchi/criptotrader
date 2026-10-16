import type { StrategyConfig } from "./strategy";
import { stopPrice } from "./stopLoss";

export type MonitorAlert = {
  kind: "compra" | "take" | "stop";
  label: string;
  triggerAt: number; // price that fires the alert
  active: boolean; // price is inside the trigger zone
};

export type MonitorState = {
  reference: number | null; // reference price used (manual or 24h high)
  referenceLabel: string;
  alerts: MonitorAlert[];
};

/**
 * Compares the live price with the saved strategy triggers.
 * Buy: price <= reference * (1 - dropPct/100) for "queda" entries.
 * Sell (take-profit / stop-loss): only when the reference is manual,
 * because those triggers are relative to the user's entry price — with a
 * manual reference the user can set it to their buy price.
 */
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** closes: closed candle closes at the strategy interval, oldest first. */
export function monitorState(cfg: StrategyConfig, price: number | null, high24h: number | null, closes: number[] = []): MonitorState {
  const reference = cfg.referenceType === "manual" ? cfg.manualReference : high24h;
  const referenceLabel = cfg.referenceType === "manual" ? "referência definida" : `máxima de ${cfg.windowHours}h`;
  const alerts: MonitorAlert[] = [];
  if (cfg.entryType === "medias" && price != null && price > 0 && cfg.maFast > 0 && cfg.maSlow > cfg.maFast && closes.length >= cfg.maSlow) {
    const fast = avg(closes.slice(-cfg.maFast));
    const slow = avg(closes.slice(-cfg.maSlow));
    alerts.push({ kind: "compra", label: `Compra: tendência de alta e preço recuando até a média de ${cfg.maSlow} velas (velas de ${cfg.candleInterval})`, triggerAt: slow, active: fast > slow && price <= slow });
  }
  if (reference == null || !(reference > 0) || price == null || !(price > 0)) return { reference, referenceLabel, alerts };

  if (cfg.entryType === "queda" && cfg.dropPct > 0) {
    const at = reference * (1 - cfg.dropPct / 100);
    alerts.push({ kind: "compra", label: `Compra: cair ${cfg.dropPct}% da ${referenceLabel}`, triggerAt: at, active: price <= at });
  }
  if (cfg.referenceType === "manual") {
    cfg.takeProfits.forEach((t, i) => {
      if (t.pct > 0) {
        const at = reference * (1 + t.pct / 100);
        alerts.push({ kind: "take", label: `Take-profit ${i + 1}: +${t.pct}% sobre a referência`, triggerAt: at, active: price >= at });
      }
    });
    if (cfg.stopLossPct > 0) {
      const at = stopPrice(reference, cfg);
      if (at != null) alerts.push({ kind: "stop", label: cfg.stopLossMode === "liquido" ? `Stop: perda líquida estimada de ${cfg.stopLossPct}% (com taxas)` : `Stop-loss: -${cfg.stopLossPct}% da referência`, triggerAt: at, active: price <= at });
    }
  }
  return { reference, referenceLabel, alerts };
}
