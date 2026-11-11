import { formatUnits } from "viem";
import { z } from "zod";

export const manualLimitsSchema = z.object({
  maxPriceImpactPct: z.number().finite().min(0).max(20),
  maxSlippagePct: z.number().finite().min(0).max(20),
});
export type ManualLimits = z.infer<typeof manualLimitsSchema>;
export function readManualLimits(value: unknown): ManualLimits | null {
  const parsed = manualLimitsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
/** Never rounds fractional token units or passes quantities through Number. */
export function tokenAmount(value: string, decimals: number, balance?: bigint): bigint {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) throw new Error("Informe uma quantidade válida, usando vírgula ou ponto decimal.");
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) throw new Error(`Este token aceita até ${decimals} casas decimais.`);
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount <= 0n) throw new Error("Informe uma quantidade maior que zero.");
  if (balance !== undefined && amount > balance) throw new Error("A quantidade supera o saldo disponível.");
  return amount;
}
export function percentageAmount(balance: bigint, percentage: number): bigint {
  return balance * BigInt(Math.round(Math.max(0, Math.min(100, percentage)) * 100)) / 10000n;
}
export function compactTokenAmount(amount: bigint, decimals: number) {
  const exact = formatUnits(amount, decimals);
  const [whole = "0", fraction = ""] = exact.split(".");
  // Keep tiny quantities visible while shortening large balances. Exact units are retained separately.
  const first = fraction.search(/[1-9]/);
  const places = whole === "0" ? Math.max(6, first + 6) : 6;
  return (whole + (fraction ? "." + fraction.slice(0, places).replace(/0+$/, "") : "")).replace(/\.$/, "").replace(".", ",");
}
export function enforceManualImpact(impact: number, limits: ManualLimits | null) {
  if (!limits) throw new Error("Defina o limite de impacto e a tolerância de variação em Ajustar limites da venda antes de cotar.");
  if (!Number.isFinite(impact) || impact < 0) throw new Error("Impacto estimado indisponível. Consulte novamente.");
  if (impact > limits.maxPriceImpactPct) {
    const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    throw new Error(`Impacto estimado: ${fmt(impact)}%. Seu limite atual: ${fmt(limits.maxPriceImpactPct)}%. Reduza a quantidade ou revise os limites da venda.`);
  }
  return limits;
}