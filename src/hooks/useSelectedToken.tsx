import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { findToken, TOKENS, type TokenInfo } from "@/lib/tokens";

const fallback: TokenInfo = TOKENS.find((token) => token.symbol === "GTE") ?? { address: "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA", symbol: "GTE", name: "Gold Tech", decimals: 18 };
const SelectedTokenContext = createContext<{ token: TokenInfo; selectToken: (address: string) => void; ready: boolean } | null>(null);

export function SelectedTokenProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = findToken(localStorage.getItem("selected-token") ?? "");
      if (saved) setToken(saved);
    } catch { /* Storage may be disabled. Selection still works in this session. */ }
    setReady(true);
  }, []);
  const selectToken = (address: string) => {
    const next = findToken(address);
    if (!next) return;
    setToken(next);
    try { localStorage.setItem("selected-token", next.address); } catch { /* Keep in-memory selection. */ }
  };
  return <SelectedTokenContext.Provider value={{ token, selectToken, ready }}>{children}</SelectedTokenContext.Provider>;
}

export function useSelectedToken() {
  const selected = useContext(SelectedTokenContext);
  if (!selected) throw new Error("SelectedTokenProvider ausente");
  return selected;
}