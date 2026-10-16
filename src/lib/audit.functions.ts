import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const auditOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hash: string }) => z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase.from("orders").select("*").eq("tx_hash", data.hash).maybeSingle();
    if (!order) throw new Error("Transação não encontrada no seu histórico");
    const { inspectReceipt } = await import("./receiptAudit.server");
    const receipt = await inspectReceipt(data.hash as `0x${string}`, order.token, order.wallet);
    const { data: audit } = await context.supabase.from("audit_log").select("details,created_at").eq("action", "robot_decision").contains("details", { hash: data.hash }).maybeSingle();
    return { ...receipt, side: order.side, quotedOutRaw: order.quoted_out, approvalHash: order.approve_hash, snapshot: audit?.details ?? null, reconstructed: !audit };
  });