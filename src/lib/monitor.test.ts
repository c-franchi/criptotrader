import { describe, expect, it } from "vitest";
import { monitorState } from "./monitor";
import { EMPTY_CONFIG } from "./strategy";

const cfg = { ...EMPTY_CONFIG, entryType: "queda" as const, dropPct: 8, referenceType: "maxima" as const, windowHours: 24 };

describe("monitoramento da estratégia", () => {
  it("compra dispara quando o preço cai 8% da máxima de 24h", () => {
    const s = monitorState(cfg, 0.92, 1);
    expect(s.alerts[0]).toMatchObject({ kind: "compra", triggerAt: 0.92, active: true });
  });
  it("fora da faixa quando a queda é menor que o gatilho", () => {
    const s = monitorState(cfg, 0.95, 1);
    expect(s.alerts[0]?.active).toBe(false);
  });
  it("sem preço ou sem referência, nenhum alerta", () => {
    expect(monitorState(cfg, null, 1).alerts).toHaveLength(0);
    expect(monitorState(cfg, 1, null).alerts).toHaveLength(0);
  });
  it("take-profit e stop-loss só com referência manual", () => {
    const manual = { ...cfg, referenceType: "manual" as const, manualReference: 1, takeProfits: [{ pct: 10, sellPct: 50 }], stopLossPct: 10 };
    const up = monitorState(manual, 1.1, 5);
    expect(up.alerts.find((a) => a.kind === "take")?.active).toBe(true);
    const down = monitorState(manual, 0.9, 5);
    expect(down.alerts.find((a) => a.kind === "stop")?.active).toBe(true);
    const auto = monitorState(cfg, 0.5, 1);
    expect(auto.alerts.some((a) => a.kind !== "compra")).toBe(false);
  });
});
