import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const auditOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hash: string }) =>
    z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders")
      .select("*")
      .eq("tx_hash", data.hash)
      .maybeSingle();
    if (!order) throw new Error("Transação não encontrada no seu histórico");
    const { inspectReceipt } = await import("./receiptAudit.server");
    const receipt = await inspectReceipt(data.hash as `0x${string}`, order.token, order.wallet);
    const { data: audit } = await context.supabase
      .from("audit_log")
      .select("details,created_at")
      .eq("action", "robot_decision")
      .contains("details", { hash: data.hash })
      .maybeSingle();
    return {
      ...receipt,
      nativeReceived:
        order.accounting_status === "confirmado" && order.actual_bnb_received != null
          ? String(order.actual_bnb_received)
          : receipt.nativeReceived,
      nativeReceivedStatus:
        order.accounting_status === "confirmado" && order.actual_bnb_received != null
          ? "BNB recebido confirmado pelas transferências da transação"
          : receipt.nativeReceivedStatus,
      side: order.side,
      quotedOutRaw: order.quoted_out,
      approvalHash: order.approve_hash,
      snapshot: audit?.details ?? null,
      reconstructed: !audit,
    };
  });
/** Receipt reconciliation only; never signs, sends or repeats a transaction. */
export const reconcileUserOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pubClient } = await import("./bot.server");
    const { inspectReceipt } = await import("./receiptAudit.server");
    const { nativeProceeds } = await import("./submission.server");
    const { formatEther } = await import("viem");
    const pub = pubClient();
    const { data: orders } = await context.supabase
      .from("orders")
      .select("*")
      .eq("source", "manual")
      .in("status", ["enviada", "aprovando"])
      .order("created_at")
      .limit(20);
    for (const o of orders ?? []) {
      try {
        const hash = o.tx_hash ?? o.approve_hash;
        if (!hash) continue;
        const tx = await pub.getTransaction({ hash: hash as `0x${string}` });
        if (tx.from.toLowerCase() !== o.wallet.toLowerCase()) continue;
        const receipt = await pub.getTransactionReceipt({ hash: hash as `0x${string}` });
        if (!o.tx_hash) {
          await supabaseAdmin
            .from("orders")
            .update({
              status: receipt.status === "success" ? "cancelada" : "falhou",
              error: "Aprovação conciliada; swap não registrado. Solicite nova cotação.",
            })
            .eq("id", o.id)
            .eq("user_id", context.userId);
          continue;
        }
        const audited = await inspectReceipt(o.tx_hash as `0x${string}`, o.token, o.wallet);
        const native =
          o.side === "venda" && receipt.status === "success"
            ? await nativeProceeds(pub, o.tx_hash as `0x${string}`, o.wallet)
            : null;
        await supabaseAdmin
          .from("orders")
          .update({
            status: receipt.status === "success" ? "confirmada" : "falhou",
            block_number: Number(receipt.blockNumber),
            actual_token_delta: audited.tokenDeltaRaw,
            gas_bnb: Number(audited.gasBnb),
            actual_bnb_received: native == null ? null : Number(formatEther(native)),
            accounting_status: o.side === "compra" || native != null ? "confirmado" : "estimado",
            error: receipt.status === "success" ? null : "Transação revertida na rede",
          })
          .eq("id", o.id)
          .eq("user_id", context.userId);
      } catch {
        /* missing receipt is pending, never failure */
      }
    }
  });

/** Recheck an already-confirmed sale without sending another transaction. */
export const reconcileOrderAccounting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id,tx_hash,wallet,wallet_scope,actual_bnb_received,side,status")
      .eq("user_id", context.userId)
      .eq("tx_hash", data.hash)
      .maybeSingle();
    if (
      error ||
      !order ||
      order.side !== "venda" ||
      order.status !== "confirmada" ||
      !order.tx_hash
    )
      throw new Error("Venda confirmada não encontrada no seu histórico.");
    if (order.actual_bnb_received != null)
      return { confirmed: true, message: "BNB recebido já confirmado." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pubClient } = await import("./bot.server");
    const { reconcileAccounting } = await import("./reconcileAccounting.server");
    return reconcileAccounting(supabaseAdmin, pubClient(), context.userId, {
      ...order,
      tx_hash: order.tx_hash,
    });
  });
