import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { findToken, TOKENS, type TokenInfo } from "@/lib/tokens";
import { supabase } from "@/integrations/supabase/client";

const fallback: TokenInfo = TOKENS.find((token) => token.symbol === "GTE") ?? { address: "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA", symbol: "GTE", name: "Gold Tech", decimals: 18 };

type Ctx = {
  token: TokenInfo;
  tokens: TokenInfo[];
  selectToken: (address: string) => void;
  addToken: (t: TokenInfo) => Promise<string | null>;
  removeToken: (address: string) => Promise<void>;
  ready: boolean;
};
const SelectedTokenContext = createContext<Ctx | null>(null);

export function SelectedTokenProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(fallback);
  const [extra, setExtra] = useState<TokenInfo[]>([]);
  const [ready, setReady] = useState(false);

  // Restore the saved selection after hydration; user-added tokens load once signed in.
  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem("selected-token") ?? ""; } catch { /* Storage may be disabled. */ }
    const builtIn = findToken(saved);
    if (builtIn) setToken(builtIn);
    setReady(true);
    const load = async () => {
      const { data } = await supabase.from("user_tokens").select("address,symbol,name,decimals").order("created_at");
      const list = ((data ?? []) as TokenInfo[]).filter((t) => !findToken(t.address));
      setExtra(list);
      const custom = findToken(saved, list);
      if (!builtIn && custom) setToken(custom);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void load(); else setExtra([]);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const selectToken = useCallback((address: string) => {
    const next = findToken(address, extra);
    if (!next) return;
    setToken(next);
    try { localStorage.setItem("selected-token", next.address); } catch { /* Keep in-memory selection. */ }
  }, [extra]);

  const addToken = async (t: TokenInfo) => {
    if (findToken(t.address, extra)) return null;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return "Entre na sua conta para adicionar tokens.";
    const { error } = await supabase.from("user_tokens").insert({ user_id: u.user.id, ...t });
    if (error) return error.message;
    setExtra((p) => [...p, t]);
    return null;
  };

  const removeToken = async (address: string) => {
    await supabase.from("user_tokens").delete().eq("address", address);
    setExtra((p) => p.filter((t) => t.address.toLowerCase() !== address.toLowerCase()));
    if (token.address.toLowerCase() === address.toLowerCase()) setToken(fallback);
  };

  return (
    <SelectedTokenContext.Provider value={{ token, tokens: [...TOKENS, ...extra], selectToken, addToken, removeToken, ready }}>
      {children}
    </SelectedTokenContext.Provider>
  );
}

export function useSelectedToken() {
  const selected = useContext(SelectedTokenContext);
  if (!selected) throw new Error("SelectedTokenProvider ausente");
  return selected;
}
