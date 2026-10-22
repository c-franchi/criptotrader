import { useAuth } from "./useAuth";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyWalletSaved } from "@/lib/security.functions";

export type SavedWallet = { id: string; label: string; address: string; created_at: string };

export const isWallet = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

/** The signed-in user's saved wallet addresses (public addresses only, never keys). */
export function useSavedWallets() {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [wallets, setWallets] = useState<SavedWallet[]>([]);
  const load = useCallback(async () => {
    if (!userId) {
      setLoadedFor(userId);
      setWallets([]);
      setReady(!loading);
      return;
    }
    const { data, error } = await supabase
      .from("user_wallets")
      .select("id,label,address,created_at")
      .eq("user_id", userId)
      .order("created_at");
    if (activeUser.current !== userId) return;
    if (error) {
      setReady(false);
      return;
    }
    setLoadedFor(userId);
    setWallets(data ?? []);
    setReady(true);
  }, [userId, loading]);
  useEffect(() => {
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener("wallets-changed", refresh);
    return () => window.removeEventListener("wallets-changed", refresh);
  }, [load]);

  const add = async (address: string, label: string) => {
    if (!isWallet(address)) return "Endereço inválido";
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return "Entre na sua conta primeiro";
    const { error } = await supabase
      .from("user_wallets")
      .insert({ user_id: u.user.id, address, label: label.trim() });
    if (error) return error.code === "23505" ? "Essa carteira já está salva" : error.message;
    void notifyWalletSaved({ data: { address } }).catch(() => {});
    await load();
    window.dispatchEvent(new Event("wallets-changed"));
    return null;
  };
  const rename = async (id: string, label: string) => {
    await supabase.from("user_wallets").update({ label: label.trim() }).eq("id", id);
    await load();
    window.dispatchEvent(new Event("wallets-changed"));
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("user_wallets").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await load();
    window.dispatchEvent(new Event("wallets-changed"));
  };
  return {
    wallets: loadedFor === userId ? wallets : [],
    add,
    rename,
    remove,
    ready: loadedFor === userId && ready,
  };
}
