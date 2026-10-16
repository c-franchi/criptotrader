import { breakEvenPct, type TokenTax } from "./tokens";
import type { PresetId } from "./strategy";

export type Recommendation = { id: PresetId; reason: string; rangePct: number };

/** Suggests a preset from the last 24h closes (oldest first) and the token taxes. Pure. */
export function recommendPreset(closes: number[], tax: TokenTax): Recommendation | null {
  const c = closes.filter((x) => x > 0);
  if (c.length < 20) return null;
  const lo = Math.min(...c), hi = Math.max(...c);
  const rangePct = (hi / lo - 1) * 100;
  const n = c.length, fast = avg(c.slice(-Math.min(9, n))), slow = avg(c.slice(-Math.min(21, n)));
  const be = breakEvenPct(tax);
  const r1 = (x: number) => x.toFixed(1).replace(".", ",");
  const taxTxt = tax.buy + tax.sell > 0 ? `taxa de ${tax.buy}%/${tax.sell}%` : "sem taxa";
  if (rangePct >= 25) return { id: "segura", rangePct, reason: `O preço oscilou ${r1(rangePct)}% em 24h — muito agitado. Melhor comprar só em quedas fortes e operar pouco.` };
  if (be >= 8 || rangePct < 8) return { id: "adaptativa", rangePct, reason: `Token com ${taxTxt} (precisa subir ${r1(be)}% para empatar) e variação de ${r1(rangePct)}% em 24h. A Adaptativa só entra quando dá para lucrar depois das taxas.` };
  if (fast > slow) return { id: "ativa", rangePct, reason: `Tendência de alta com ${taxTxt}. A Ativa compra nos recuos até a média e vende rápido.` };
  return { id: "equilibrada", rangePct, reason: `Preço em queda leve com variação de ${r1(rangePct)}%. Comprar em degraus de 5% de queda com proteção de lucro é mais seguro.` };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
