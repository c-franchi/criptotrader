export const FIAT_CURRENCIES = ["BRL", "USD", "EUR"] as const;
export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];
export const CURRENCY_KEY = "cryptobot:currency";
export const fiatCurrency = (value: unknown): FiatCurrency =>
  FIAT_CURRENCIES.includes(value as FiatCurrency) ? (value as FiatCurrency) : "BRL";
export function fiatEstimate(
  value: number | string | null | undefined,
  source: "BNB" | "USD",
  currency: FiatCurrency,
  rates: { bnbUsd: number | null; usdBrl: number | null; usdEur?: number | null } | null,
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value),
    usdRate = source === "USD" ? 1 : rates?.bnbUsd;
  const localRate = currency === "USD" ? 1 : currency === "BRL" ? rates?.usdBrl : rates?.usdEur;
  if (!Number.isFinite(n) || !usdRate || usdRate <= 0 || !localRate || localRate <= 0) return null;
  const result = n * usdRate * localRate;
  return Number.isFinite(result) ? result : null;
}
export const formatFiat = (value: number, currency: FiatCurrency) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 6 : 2,
  });
