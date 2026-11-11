import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { LEGACY_WALLET_SCOPE } from "./walletScope";
import { readManualLimits } from "./manualSale";

export async function assertManualScope(
  client: SupabaseClient<Database>,
  userId: string,
  scope: string,
) {
  if (scope === LEGACY_WALLET_SCOPE) return;
  const { data, error } = await client
    .from("user_wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("id", scope)
    .maybeSingle();
  if (error || !data)
    throw new Error("Confira a carteira selecionada; ela não pertence à sua conta.");
}
export async function readSaleLimits(
  client: SupabaseClient<Database>,
  userId: string,
  scope: string,
  token: string,
) {
  await assertManualScope(client, userId, scope);
  const { data, error } = await client
    .from("manual_sale_limits")
    .select("max_price_impact_pct,max_slippage_pct")
    .eq("user_id", userId)
    .eq("wallet_scope", scope)
    .eq("token", token.toLowerCase())
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar os limites da venda. Tente novamente.");
  if (data)
    return {
      limits: readManualLimits({
        maxPriceImpactPct: data.max_price_impact_pct,
        maxSlippagePct: data.max_slippage_pct,
      }),
      source: "manual" as const,
    };
  const strategy = await client
    .from("strategies")
    .select("config")
    .eq("user_id", userId)
    .eq("wallet_scope", scope)
    .ilike("token", token)
    .maybeSingle();
  if (strategy.error) throw new Error("Não foi possível consultar a configuração desta carteira.");
  return { limits: readManualLimits(strategy.data?.config), source: "strategy" as const };
}
