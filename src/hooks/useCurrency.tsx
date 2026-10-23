import { CurrencyContext, useCurrency } from "./currencyContext";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFxQuote } from "@/lib/fx.functions";
import {
  CURRENCY_KEY,
  fiatCurrency,
  fiatEstimate,
  formatFiat,
  type FiatCurrency,
} from "@/lib/fiat";
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setValue] = useState<FiatCurrency>("BRL");
  const q = useQuery({
    queryKey: ["display-fx"],
    queryFn: () => getFxQuote(),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
  });
  useEffect(() => {
    try {
      setValue(fiatCurrency(localStorage.getItem(CURRENCY_KEY)));
    } catch {
      /* Defaults to BRL. */
    }
    const sync = (e: StorageEvent) => {
      if (e.key === CURRENCY_KEY || e.key === null) setValue(fiatCurrency(e.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setCurrency = (next: FiatCurrency) => {
    setValue(next);
    try {
      localStorage.setItem(CURRENCY_KEY, next);
    } catch {
      /* Keep the selection in memory. */
    }
  };
  const validQuote = q.data && !q.isError && Date.now() - q.data.at < 180000 ? q.data : null;
  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, quote: validQuote }}>
      {children}
    </CurrencyContext.Provider>
  );
}
export function FiatValue({
  bnb,
  usd,
  className = "",
  hideUsdDuplicate = false,
}: {
  bnb?: number | string | null | undefined;
  usd?: number | string | null | undefined;
  className?: string;
  hideUsdDuplicate?: boolean;
}) {
  const { currency, quote } = useCurrency();
  if (hideUsdDuplicate && currency === "USD") return null;
  const value = fiatEstimate(bnb ?? usd, bnb != null ? "BNB" : "USD", currency, quote);
  return (
    <span
      className={`block text-xs font-normal text-muted-foreground ${className}`}
      title={
        quote
          ? `Conversão estimada às ${new Date(quote.at).toLocaleTimeString("pt-BR")}; não altera o valor da operação.`
          : "Cotação de conversão indisponível"
      }
    >
      {value == null
        ? `Conversão para ${currency} indisponível`
        : `≈ ${formatFiat(value, currency)}`}
    </span>
  );
}
