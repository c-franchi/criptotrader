import { walletCapital, type CapitalBot } from "./walletCapital";
import type { StrategyConfig } from "./strategy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function readWalletCapital(
  admin: SupabaseClient<Database>,
  userId: string,
  scope: string,
  balance: string,
  previewId?: string,
) {
  const [bots, strategies] = await Promise.all([
    admin
      .from("grid_bots")
      .select("id,token,armed,mode,order_bnb,gas_reserve_bnb,strat_state")
      .eq("user_id", userId)
      .eq("wallet_scope", scope),
    admin.from("strategies").select("token,config").eq("user_id", userId).eq("wallet_scope", scope),
  ]);
  if (bots.error || strategies.error)
    throw new Error("Não foi possível conferir o capital reservado pelos robôs desta carteira");
  const list: CapitalBot[] = (bots.data ?? []).map((b) => ({
    ...b,
    config: strategies.data?.find((s) => s.token.toLowerCase() === b.token.toLowerCase())
      ?.config as Partial<StrategyConfig> | undefined,
  }));
  return walletCapital(balance, list, previewId);
}
