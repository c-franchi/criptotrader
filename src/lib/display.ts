/** Display precision only; never used for execution amounts. */
export function formatPrice(value: number | string | null | undefined) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(
    "pt-BR",
    n !== 0 && Math.abs(n) < 1
      ? { maximumSignificantDigits: 6 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );
}
export const formatUsd = (value: number | string | null | undefined) =>
  formatPrice(value) === "—" ? "—" : `US$ ${formatPrice(value)}`;

/** A positive distance must never be shown as zero (nor used as a rounded trigger). */
export function formatDistancePct(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.001) return "< 0,001%";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
}
