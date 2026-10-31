/* eslint-disable @typescript-eslint/no-explicit-any */
import { BeforeBroadcastError } from "./executionPhase";

export class BotStoppedError extends BeforeBroadcastError {}

/** No wallet mutex: stopping must also work while that wallet is executing. */
export async function stopAllUserBots(admin: any, userId: string) {
  const { error, count } = await admin
    .from("grid_bots")
    .update({ armed: false, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("user_id", userId)
    .eq("armed", true);
  if (error) throw new Error("Não foi possível confirmar a parada dos bots. Tente novamente.");
  // Audit failure must never undo or misreport a successful emergency stop.
  let auditRecorded = false;
  try {
    const result = await admin.from("audit_log").insert({
      user_id: userId,
      action: "bots_emergency_stopped",
      details: { stopped: count, all_wallets: true },
    });
    auditRecorded = !result.error;
  } catch {
    /* The stop is already committed. */
  }
  return { stopped: count as number | null, auditRecorded };
}

/** Fresh, uncached check for every bot approval and swap; withdrawals have no botId. */
export async function assertBotRunning(admin: any, userId: string, botId?: string) {
  if (!botId) return;
  const { data, error } = await admin
    .from("grid_bots")
    .select("armed,archived_at")
    .eq("id", botId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new Error("Não foi possível verificar se o bot continua ligado; envio bloqueado.");
  if (!data?.armed || data.archived_at)
    throw new BotStoppedError("Bot parado. Nova transação bloqueada antes do envio.");
}
