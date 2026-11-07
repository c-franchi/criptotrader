/* eslint-disable @typescript-eslint/no-explicit-any */
import { reconcileAccounting } from "./reconcileAccounting.server";

/**
 * Independent read-only reconciliation. No trade signing, rebroadcast, nonce
 * manipulation or portfolio-state mutations. Missing/ambiguous evidence stays
 * pending with a durable retry schedule.
 */
export async function tickAccounting(admin: any, pub: any) {
  const { data: claims, error: claimError } = await admin.rpc("claim_order_accounting", {
    p_limit: 2,
  });
  if (claimError) throw new Error("Fila de conciliação indisponível (migração 0023)");
  let verified = 0;
  let pending = 0;
  let errors = 0;
  for (const job of claims ?? []) {
    // Do not trust a claim without re-reading its ownership and transaction status.
    let status = "Pendente de comprovação por recibo ou rastreamento";
    let finished = false;
    try {
      const { data: order, error } = await admin
        .from("orders")
        .select(
          "id,user_id,tx_hash,wallet,wallet_scope,token,pair_address,amount_in,side,status,actual_bnb_received",
        )
        .eq("id", job.order_id)
        .eq("user_id", job.user_id)
        .maybeSingle();
      if (error || !order) throw new Error("Venda não encontrada");
      if (order.actual_bnb_received != null) {
        finished = true;
      } else if (
        order.side !== "venda" ||
        order.status !== "confirmada" ||
        !order.tx_hash ||
        !order.wallet
      ) {
        throw new Error("Registro não elegível para conciliação automática");
      } else {
        const result = await reconcileAccounting(admin, pub, order.user_id, {
          id: order.id,
          tx_hash: order.tx_hash,
          wallet: order.wallet,
          wallet_scope: order.wallet_scope,
          token: order.token,
          pair_address: order.pair_address,
          amount_in: order.amount_in,
        });
        finished = result.confirmed;
      }
      if (finished) verified++;
      else pending++;
    } catch {
      errors++;
      status = "Provedor ou banco não permitiu confirmar esta transação";
    }
    const { error: updateError } = await admin
      .from("order_accounting_retry")
      .update({
        ...(finished ? { resolved_at: new Date().toISOString() } : {}),
        last_error: finished ? null : status,
        next_attempt_at: new Date(
          Date.now() +
            (finished ? 0 : Math.min(6 * 60, 20 * 2 ** Math.min(4, job.attempts))) * 60000,
        ).toISOString(),
      })
      .eq("order_id", job.order_id)
      .eq("user_id", job.user_id);
    if (updateError) throw new Error("Falha ao persistir o agendamento de conciliação");
  }
  const { error: heartbeatError } = await admin.from("accounting_worker_heartbeat").upsert({
    id: 1,
    last_run_at: new Date().toISOString(),
    verified,
    pending,
    errors,
  });
  if (heartbeatError) throw new Error("Falha ao registrar o monitor de conciliação");
  return { claimed: (claims ?? []).length, verified, pending, errors };
}
