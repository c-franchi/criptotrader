import type { SupabaseClient } from "@supabase/supabase-js";
/** Disarm only. Keep the position, receipts, cost basis, and execution locks intact. */
export async function finishAutomationKeepingAssets(
  client: Pick<SupabaseClient, "from">,
  userId: string,
  walletScope: string,
  botId: string,
) {
  const { data, error } = await client
    .from("grid_bots")
    .update({ armed: false, updated_at: new Date().toISOString() })
    .eq("id", botId)
    .eq("user_id", userId)
    .eq("wallet_scope", walletScope)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new Error("Não foi possível finalizar a automação. Atualize o estado e tente novamente.");
  const { error: auditError } = await client.from("audit_log").insert({
    user_id: userId,
    action: "bot_disarmed",
    details: { bot_id: botId, wallet_scope: walletScope, keep_assets: true },
  });
  return { auditRecorded: !auditError };
}
