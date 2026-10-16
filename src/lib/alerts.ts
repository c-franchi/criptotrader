export type AlertState = "longe" | "perto" | "atingiu";
export type AlertRule = { direction: "queda" | "alta"; basePrice: number; targetPct: number; warnBeforePct: number };

/** How far the price moved from the base in the alert direction, in %. */
export function movePct(rule: AlertRule, price: number): number {
  const d = ((price - rule.basePrice) / rule.basePrice) * 100;
  return rule.direction === "queda" ? -d : d;
}

export function alertState(rule: AlertRule, price: number): AlertState {
  const m = movePct(rule, price);
  if (m >= rule.targetPct) return "atingiu";
  if (m >= rule.targetPct - rule.warnBeforePct) return "perto";
  return "longe";
}

export function targetPrice(rule: AlertRule): number {
  return rule.basePrice * (1 + (rule.direction === "queda" ? -1 : 1) * (rule.targetPct / 100));
}

const RANK: Record<AlertState, number> = { longe: 0, perto: 1, atingiu: 2 };
/** Notify only when the price gets closer than before (no repeated messages every minute). */
export function shouldNotify(prev: AlertState, next: AlertState): boolean {
  return RANK[next] > RANK[prev];
}
