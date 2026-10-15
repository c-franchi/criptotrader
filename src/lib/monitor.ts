import type { StrategyConfig } from "./strategy";

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
export function monitorState(cfg: StrategyConfig, price: number | null, high24h: number | null): MonitorState {
  const reference = cfg.referenceType === "manual" ? cfg.manualReference : high24h;
  const referenceLabel = cfg.referenceType === "manual" ? "referência definida" : `máxima de ${cfg.windowHours}h`;
  const alerts: MonitorAlert[] = [];
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
      const at = reference * (1 - cfg.stopLossPct / 100);
      alerts.push({ kind: "stop", label: `Stop-loss: -${cfg.stopLossPct}% da referência`, triggerAt: at, active: price <= at });
    }
  }
  return { reference, referenceLabel, alerts };
}
