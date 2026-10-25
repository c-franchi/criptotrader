import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { findToken, TOKENS, type TokenInfo } from "@/lib/tokens";
import { supabase } from "@/integrations/supabase/client";

const fallback: TokenInfo = TOKENS[0]!;

type Ctx = {
  token: TokenInfo;
  tokens: TokenInfo[];
  selectToken: (address: string) => void;
  selectInspectedToken: (token: TokenInfo) => void;
  addToken: (t: TokenInfo) => Promise<string | null>;
  removeToken: (address: string) => Promise<void>;
  ready: boolean;
};
const SelectedTokenContext = createContext<Ctx | null>(null);

export function SelectedTokenProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(fallback);
  const [extra, setExtra] = useState<TokenInfo[]>([]);
  const choice = useRef(0);
  const [ready, setReady] = useState(false);

  // Restore the saved selection after hydration; user-added tokens load once signed in.
  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem("selected-token") ?? "";
    } catch {
      /* Storage may be disabled. */
    }
    const builtIn = findToken(saved);
    if (builtIn) setToken(builtIn);
    setReady(true);
    const initialChoice = choice.current;
    const load = async () => {
      const { data } = await supabase
        .from("user_tokens")
        .select("address,symbol,name,decimals")
        .order("created_at");
      const list = ((data ?? []) as TokenInfo[]).filter((t) => !findToken(t.address));
      setExtra((current) => [...list, ...current.filter((t) => !findToken(t.address, list))]);
      const custom = findToken(saved, list);
      if (!builtIn && custom && choice.current === initialChoice) setToken(custom);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void load();
      else setExtra([]);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const selectToken = useCallback(
    (address: string) => {
      const next = findToken(address, extra);
      if (!next) return;
      choice.current += 1;
      setToken(next);
      try {
        localStorage.setItem("selected-token", next.address);
      } catch {
        /* Keep in-memory selection. */
      }
    },
    [extra],
  );

  const selectInspectedToken = useCallback((next: TokenInfo) => {
    choice.current += 1;
    setExtra((list) => (findToken(next.address, list) ? list : [...list, next]));
    setToken(next);
    try {
      localStorage.setItem("selected-token", next.address);
    } catch {
      /* optional storage */
    }
  }, []);

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
    <SelectedTokenContext.Provider
      value={{
        token,
        tokens: [...TOKENS, ...extra],
        selectToken,
        selectInspectedToken,
        addToken,
        removeToken,
        ready,
      }}
    >
      {children}
    </SelectedTokenContext.Provider>
  );
}

export function useSelectedToken() {
  const selected = useContext(SelectedTokenContext);
  if (!selected) throw new Error("SelectedTokenProvider ausente");
  return selected;
}
