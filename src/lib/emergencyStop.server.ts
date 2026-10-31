import { BeforeBroadcastError } from "./executionPhase";

/* eslint-disable @typescript-eslint/no-explicit-any */
export class BotStoppedError extends BeforeBroadcastError {}

/** No wallet mutex: stopping must remain available during a pending transaction. */
export async function stopAllUserBots(admin: any, userId: string) {
  const { data, error } = await admin
    .from("grid_bots")
    .update({ armed: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("armed", true)
    .select("id,wallet_scope");
  if (error) throw new Error("Não foi possível confirmar a parada. Tente novamente.");
  // Do not touch positions, pending submissions, or execution locks.
  const stopped = data?.length ?? 0;
  const { error: auditError } = await admin.from("audit_log").insert({
    user_id: userId,
    action: "bots_emergency_stopped",
    details: { bots: data ?? [], stopped, all_wallets: true },
  });
  return { stopped, auditSaved: !auditError };
}

/** Re-read durable state after slow RPC work and after a sale's approval receipt. */
export async function assertBotCanSubmit(admin: any, userId: string, intent: Record<string, any>) {
  if (!intent["botId"]) return; // Personal-wallet operations and asset returns are independent.
  const { data, error } = await admin
    .from("grid_bots")
    .select("armed,archived_at,updated_at")
    .eq("user_id", userId)
    .eq("id", intent["botId"])
    .maybeSingle();
  if (error)
    throw new BeforeBroadcastError("Não foi possível verificar se o robô continua ligado.");
  if (
    !data?.armed ||
    data.archived_at ||
    (intent["botUpdatedAt"] && data.updated_at !== intent["botUpdatedAt"])
  )
    throw new BotStoppedError("Robô parado ou alterado. Esta ordem não foi enviada.");
}
