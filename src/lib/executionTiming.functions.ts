import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { walletScopeSchema } from "./walletScope";
import { assertWalletScope } from "./walletScope.server";
import type { TimingSnapshot } from "./executionTiming";
const stageSchema = z.object({
  runId: z.string().uuid(),
  botId: z.string(),
  walletScope: z.string(),
  token: z.string(),
  trigger: z.enum(["schedule", "block"]),
  stages: z.record(z.number().finite().nonnegative()),
  elapsedMs: z.number().finite().nonnegative(),
  previousEvaluationAt: z.number().finite().nonnegative().optional(),
  phase: z.string(),
  hash: z.string().optional(),
});
export const getExecutionTiming = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ walletScope: walletScopeSchema, token: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const { data: bot, error } = await admin
      .from("grid_bots")
      .select("id,armed,last_run_at")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .ilike("token", data.token)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar o tempo do robô.");
    if (!bot)
      return {
        armed: false,
        evaluatedAt: null as string | null,
        records: [] as (TimingSnapshot & { phase: string; hash?: string })[],
        submissions: [] as { hash: string; status: string; at: string }[],
      };
    const [events, journal] = await Promise.all([
      admin
        .from("audit_log")
        .select("details")
        .eq("user_id", context.userId)
        .eq("action", "bot_execution_progress")
        .eq("details->>botId", bot.id)
        .eq("details->>walletScope", data.walletScope)
        .order("created_at", { ascending: false })
        .limit(40),
      admin
        .from("execution_submissions")
        .select("tx_hash,created_at,finished_at,receipt")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .eq("intent->>botId", bot.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (events.error || journal.error)
      throw new Error("Medições temporariamente indisponíveis. Isso não altera as regras do bot.");
    const records = (events.data ?? []).flatMap((row) => {
      const p = stageSchema.safeParse(row.details);
      return p.success ? [p.data as TimingSnapshot & { phase: string; hash?: string }] : [];
    });
    return {
      armed: bot.armed,
      evaluatedAt: bot.last_run_at,
      records,
      submissions: (journal.data ?? []).map((row) => {
        const r = (row.receipt ?? {}) as { status?: string };
        return {
          hash: row.tx_hash,
          at: row.created_at,
          status: row.finished_at
            ? r.status === "success"
              ? "confirmed"
              : r.status === "reverted"
                ? "reverted"
                : "pending"
            : "pending",
        };
      }),
    };
  });
export const testExecutionRpc = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sharedRead } = await import("./sharedReads.server");
    const { probeRobotRpc, rpcRouter } = await import("./robotRpc.server");
    return {
      tests: await sharedRead("robot-rpc-probe", 30000, probeRobotRpc),
      recent: rpcRouter().snapshot(),
    };
  });
