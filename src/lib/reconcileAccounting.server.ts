/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPublicClient, formatEther, http } from "viem";
import { bsc } from "viem/chains";
import { nativeProceeds } from "./submission.server";

/** Optional archive reader is used only for accounting, never the trading/execution client. */
export async function readAccountingProceeds(
  pub: any,
  hash: `0x${string}`,
  wallet: string,
  blockHash: string,
) {
  const direct = await nativeProceeds(pub, hash, wallet);
  if (direct != null) return { raw: direct, source: "execution_rpc_call_trace" };
  const url = process.env["BSC_TRACE_RPC_URL"];
  if (!url) return null;
  const archive = createPublicClient({
    chain: bsc,
    transport: http(url, { timeout: 8000, retryCount: 0 }),
  });
  try {
    const [chain, receipt] = await Promise.all([
      archive.getChainId(),
      archive.getTransactionReceipt({ hash }),
    ]);
    if (
      chain !== 56 ||
      receipt.status !== "success" ||
      receipt.blockHash.toLowerCase() !== blockHash.toLowerCase()
    )
      return null;
    const raw = await nativeProceeds(archive, hash, wallet);
    return raw == null ? null : { raw, source: "archive_rpc_call_trace" };
  } catch {
    return null;
  }
}
const nextAttempt = new Map<string, number>();
const active = new Map<string, Promise<{ confirmed: boolean; message: string }>>();
/** Never changes bot state, gas, order quantity, execution locks or transaction status. */
export async function reconcileAccounting(
  admin: any,
  pub: any,
  userId: string,
  order: { id: string; tx_hash: string; wallet: string; wallet_scope: string },
) {
  const key = `${userId}:${order.id}:${order.tx_hash}`;
  const pending = active.get(key);
  if (pending) return pending;
  const unavailable = {
    confirmed: false,
    message:
      "A rede ainda não forneceu o valor recebido. A venda permanece confirmada e o resultado está pendente de apuração.",
  };
  if ((nextAttempt.get(key) ?? 0) > Date.now()) return unavailable;
  const request = (async () => {
    try {
      const hash = order.tx_hash as `0x${string}`;
      const [tx, receipt] = await Promise.all([
        pub.getTransaction({ hash }),
        pub.getTransactionReceipt({ hash }),
      ]);
      if (tx.from.toLowerCase() !== order.wallet.toLowerCase() || receipt.status !== "success")
        return unavailable;
      const evidence = await readAccountingProceeds(pub, hash, order.wallet, receipt.blockHash);
      if (!evidence) return unavailable;
      const amount = formatEther(evidence.raw);
      const { error: auditError } = await admin.from("audit_log").insert({
        user_id: userId,
        action: "order_native_proceeds_confirmed",
        details: {
          hash,
          wallet: order.wallet,
          wallet_scope: order.wallet_scope,
          order_id: order.id,
          block_hash: receipt.blockHash,
          native_received_raw: evidence.raw.toString(),
          source: evidence.source,
        },
      });
      if (auditError) throw new Error("Não foi possível registrar a evidência da apuração.");
      const { data: updated, error } = await admin
        .from("orders")
        .update({ actual_bnb_received: amount, accounting_status: "confirmado" })
        .eq("id", order.id)
        .eq("user_id", userId)
        .eq("wallet_scope", order.wallet_scope)
        .eq("tx_hash", hash)
        .eq("status", "confirmada")
        .is("actual_bnb_received", null)
        .select("id")
        .maybeSingle();
      if (error || !updated)
        throw new Error(
          "Não foi possível salvar a apuração. Atualize o histórico e confira novamente.",
        );
      return { confirmed: true, message: "BNB recebido confirmado na rede. Resultado atualizado." };
    } finally {
      if (nextAttempt.size > 1000) nextAttempt.clear();
      nextAttempt.set(key, Date.now() + 60000);
    }
  })().finally(() => active.delete(key));
  active.set(key, request);
  return request;
}
