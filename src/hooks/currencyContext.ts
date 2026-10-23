import { createContext, useContext } from "react";
import type { FxQuote } from "@/lib/fx.functions";
import type { FiatCurrency } from "@/lib/fiat";
type CurrencyContextValue = {
  currency: FiatCurrency;
  setCurrency: (currency: FiatCurrency) => void;
  quote: FxQuote | null;
};
export const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "BRL",
  setCurrency: () => {},
  quote: null,
});

export function useCurrency() {
  return useContext(CurrencyContext);
}
