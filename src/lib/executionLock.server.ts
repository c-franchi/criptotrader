/** Persistent wallet-wide mutex; no expiry can race a still-pending chain transaction. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function acquireExecution(admin: any, userId: string) {
  const owner = crypto.randomUUID();
  const { error } = await admin.from("bot_execution_locks").insert({ user_id: userId, owner });
  if (error) throw new Error("Carteira em execução ou confirmação pendente; aguarde antes de repetir");
  return owner;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function releaseExecution(admin: any, userId: string, owner: string) {
  const { error } = await admin.from("bot_execution_locks").delete().eq("user_id", userId).eq("owner", owner);
  if (error) throw new Error("Não foi possível liberar a execução; verifique o histórico antes de repetir");
}

/** Swaps carry a 5-minute deadline, so after this a transaction can no longer execute on-chain. */
export const STALE_LOCK_MS = 15 * 60 * 1000;

type Receipt = { status: "success" | "reverted"; blockNumber: bigint } | null;

/**
 * Pure decision: a lock may be released only when it is old enough that any swap deadline has
 * passed AND every submitted order ("enviada" with hash) has a receipt or is past its deadline.
 */
export function canReleaseLock(acquiredAtMs: number, nowMs: number, pending: { deadline: number; resolved: boolean }[]) {
  if (nowMs - acquiredAtMs < STALE_LOCK_MS) return false;
  return pending.every((p) => p.resolved || nowMs / 1000 > p.deadline + 60);
}

/** Reconciles stuck locks: records receipts of pending orders, then releases locks no transaction can still use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reconcileLocks(admin: any, getReceipt: (hash: `0x${string}`) => Promise<Receipt>, nowMs = Date.now()) {
  const { data: locks } = await admin.from("bot_execution_locks").select("user_id, owner, acquired_at");
  let released = 0;
  for (const l of locks ?? []) {
    const acquired = new Date(l.acquired_at).getTime();
    if (nowMs - acquired < STALE_LOCK_MS) continue;
    const { data: orders } = await admin.from("orders").select("id, tx_hash, deadline").eq("user_id", l.user_id).eq("status", "enviada");
    const pending: { deadline: number; resolved: boolean }[] = [];
    for (const o of orders ?? []) {
      let resolved = false, rpcFailed = false;
      if (o.tx_hash) {
        try {
          const r = await getReceipt(o.tx_hash);
          if (r) {
            resolved = true;
            await admin.from("orders").update({ status: r.status === "success" ? "confirmada" : "falhou", block_number: Number(r.blockNumber), error: r.status === "success" ? null : "Transação revertida na rede", updated_at: new Date(nowMs).toISOString() }).eq("id", o.id);
          }
        } catch { rpcFailed = true; /* network unreachable: cannot prove anything, keep the lock */ }
      }
      if (!resolved && !rpcFailed && nowMs / 1000 > Number(o.deadline) + 60) {
        // Deadline passed without a receipt: the swap can no longer execute.
        await admin.from("orders").update({ status: "falhou", error: "Não confirmada antes do prazo; nada foi trocado", updated_at: new Date(nowMs).toISOString() }).eq("id", o.id);
        resolved = true;
      }
      pending.push({ deadline: Number(o.deadline), resolved });
    }
    if (!canReleaseLock(acquired, nowMs, pending)) continue;
    await releaseExecution(admin, l.user_id, l.owner);
    await admin.from("audit_log").insert({ user_id: l.user_id, action: "execution_lock_reconciled", details: { acquired_at: l.acquired_at, orders_checked: pending.length } });
    released++;
  }
  return released;
}
