import { LEGACY_WALLET_SCOPE } from "./walletScope";
/** Persistent wallet-wide mutex. Age alone is never evidence of a failed transaction. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function acquireExecution(
  admin: any,
  userId: string,
  walletScope = LEGACY_WALLET_SCOPE,
) {
  const owner = crypto.randomUUID();
  const { error } = await admin
    .from("bot_execution_locks")
    .insert({ user_id: userId, owner, wallet_scope: walletScope });
  if (error)
    throw new Error("Carteira em execução ou confirmação pendente; aguarde antes de repetir");
  return owner;
}
export async function releaseExecution(admin: any, userId: string, owner: string) {
  const { error } = await admin
    .from("bot_execution_locks")
    .delete()
    .eq("user_id", userId)
    .eq("owner", owner);
  if (error)
    throw new Error("Não foi possível liberar a execução; verifique o histórico antes de repetir");
}
export const STALE_LOCK_MS = 15 * 60 * 1000;
type Receipt = { status: "success" | "reverted"; blockNumber: bigint } | null;
export function canReleaseLock(
  _acquired: number,
  _now: number,
  pending: { deadline: number; resolved: boolean }[],
) {
  return pending.length > 0 && pending.every((p) => p.resolved);
}
/** Legacy orders cannot restore strategy memory safely: stop the bot and require explicit reconciliation. */
export async function reconcileLocks(
  admin: any,
  getReceipt: (hash: `0x${string}`) => Promise<Receipt>,
  now = Date.now(),
) {
  const { data: locks, error } = await admin
    .from("bot_execution_locks")
    .select("user_id, owner, acquired_at,wallet_scope");
  if (error) throw error;
  const released = 0;
  for (const l of locks ?? []) {
    const { data: journal, error: journalError } = await admin
      .from("execution_submissions")
      .select("id")
      .eq("lock_owner", l.owner)
      .limit(1);
    if (journalError) throw journalError;
    if (journal?.length) continue; // new journal reconciliation owns these locks
    if (now - new Date(l.acquired_at).getTime() < STALE_LOCK_MS) continue;
    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id,tx_hash,source")
      .eq("user_id", l.user_id)
      .eq("wallet_scope", l.wallet_scope ?? LEGACY_WALLET_SCOPE)
      .eq("status", "enviada");
    if (ordersError) continue;
    // Do not release unknown submissions, approvals or withdrawals, even if no order was saved.
    for (const o of orders ?? []) {
      if (!o.tx_hash) continue;
      try {
        const r = await getReceipt(o.tx_hash);
        if (!r) continue;
        const { error: updateError } = await admin
          .from("orders")
          .update({
            status: r.status === "success" ? "confirmada" : "falhou",
            block_number: Number(r.blockNumber),
            error: "Ordem legada conciliada; estado do robô requer revisão",
            updated_at: new Date(now).toISOString(),
          })
          .eq("id", o.id);
        if (updateError) continue;
        await admin
          .from("grid_bots")
          .update({
            armed: false,
            last_error: "Execução legada pendente: concilie o saldo e a posição antes de religar",
          })
          .eq("user_id", l.user_id)
          .eq("wallet_scope", l.wallet_scope ?? LEGACY_WALLET_SCOPE);
      } catch {
        /* retain the lock until there is positive evidence */
      }
    }
  }
  return released;
}
