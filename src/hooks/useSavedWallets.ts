import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyWalletSaved } from "@/lib/security.functions";

export type SavedWallet = { id: string; label: string; address: string; created_at: string };

export const isWallet = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

/** The signed-in user's saved wallet addresses (public addresses only, never keys). */
export function useSavedWallets() {
  const [wallets, setWallets] = useState<SavedWallet[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("user_wallets")
      .select("id,label,address,created_at")
      .order("created_at");
    setWallets(data ?? []);
  }, []);
  useEffect(() => {
    void load();
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
    return null;
  };
  const rename = async (id: string, label: string) => {
    await supabase.from("user_wallets").update({ label: label.trim() }).eq("id", id);
    await load();
  };
  const remove = async (id: string) => {
    await supabase.from("user_wallets").delete().eq("id", id);
    await load();
  };
  return { wallets, add, rename, remove };
}
