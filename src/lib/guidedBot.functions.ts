import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { walletScopeSchema } from "./walletScope";
import { assertWalletScope } from "./walletScope.server";
import {
  guidedInputSchema,
  buildGuidedConfig,
  incompatibleBotToken,
  INCOMPATIBLE_BNB,
} from "./guidedBot";
const selection = z.object({
  walletScope: walletScopeSchema,
  token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});
export const getGuidedBotSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => selection.parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const [strategy, draft, bot] = await Promise.all([
      admin
        .from("strategies")
        .select("config,version")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .ilike("token", data.token)
        .maybeSingle(),
      admin
        .from("strategy_drafts")
        .select("config,revision,base_version")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .eq("token", data.token.toLowerCase())
        .maybeSingle(),
      admin
        .from("grid_bots")
        .select("id,armed,strat_state,mode,lower_price,upper_price,levels")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .ilike("token", data.token)
        .maybeSingle(),
    ]);
    if (strategy.error || draft.error || bot.error)
      throw new Error("Não foi possível carregar as regras. Tente novamente.");
    return { strategy: strategy.data, draft: draft.data, bot: bot.data };
  });
export const saveGuidedBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    selection
      .extend({
        settings: guidedInputSchema,
        version: z.number().int().nonnegative(),
        draftRevision: z.number().int().nonnegative(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (incompatibleBotToken(data.token)) throw new Error(INCOMPATIBLE_BNB);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const { recoverPreflightExecution } = await import("./executionLock.server");
    await recoverPreflightExecution(admin, context.userId, data.walletScope);
    const config = buildGuidedConfig(data.settings);
    const { data: id, error } = await admin.rpc(
      "configure_guided_bot" as never,
      {
        p_user: context.userId,
        p_scope: data.walletScope,
        p_token: data.token,
        p_config: config,
        p_version: data.version,
        p_draft_revision: data.draftRevision,
        p_grid: {
          lower: data.settings.lower,
          upper: data.settings.upper,
          levels: data.settings.levels,
        },
      } as never,
    );
    if (error)
      throw new Error(
        /Pause o robô|posição|BNB e WBNB|Execution|Strategy changed|Draft changed|Wallet execution/.test(
          error.message,
        )
          ? "Não foi possível substituir as regras: pause o robô, confira posições e operações pendentes ou reabra a configuração se outra janela alterou os dados."
          : "Não foi possível salvar. Seus campos continuam preenchidos; tente novamente.",
      );
    return { id: String(id), version: data.version + 1 };
  });
export const getBotReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => selection.parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(supabaseAdmin, context.userId, data.walletScope);
    const { readBotReadiness } = await import("./botReadiness.server");
    return readBotReadiness(supabaseAdmin, context.userId, data.walletScope, data.token);
  });
export const startGuidedBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    selection.extend({ confirmation: z.literal("INICIAR ROBÔ") }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const { recoverPreflightExecution } = await import("./executionLock.server");
    await recoverPreflightExecution(admin, context.userId, data.walletScope);
    const { readBotReadiness } = await import("./botReadiness.server");
    const check = await readBotReadiness(admin, context.userId, data.walletScope, data.token);
    if (!check.ready || !check.botId || !check.updatedAt)
      throw new Error(check.errors[0] ?? "Confira a configuração antes de iniciar.");
    const { error } = await admin.rpc(
      "start_checked_bot" as never,
      {
        p_user: context.userId,
        p_scope: data.walletScope,
        p_bot: check.botId,
        p_version: check.version,
        p_updated_at: check.updatedAt,
      } as never,
    );
    if (error)
      throw new Error(
        "O estado mudou ou há uma operação pendente. Atualize as verificações antes de iniciar.",
      );
    return { ok: true };
  });

export const getGuidedBotPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => selection.parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const { data: bot, error } = await admin
      .from("grid_bots")
      .select("id,strat_state")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .ilike("token", data.token)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error("Resultados indisponíveis.");
    if (!bot) return null;
    const { data: journal, error: journalError } = await admin
      .from("execution_submissions")
      .select("tx_hash")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .contains("intent", { botId: bot.id })
      .not("finished_at", "is", null)
      .limit(1001);
    if (journalError) throw new Error("Histórico de confirmação indisponível.");
    const hashes = (journal ?? []).map((r) => r.tx_hash);
    const { data: orders, error: orderError } = hashes.length
      ? await admin
          .from("orders")
          .select("side,status,amount_in,actual_token_delta,actual_bnb_received,gas_bnb")
          .eq("user_id", context.userId)
          .eq("wallet_scope", data.walletScope)
          .in("tx_hash", hashes.slice(0, 1000))
          .order("created_at")
      : { data: [], error: null };
    if (orderError) throw new Error("Não foi possível conferir os resultados.");
    const { readMarket } = await import("./market.server");
    const { getFxQuote } = await import("./fx.functions");
    const [market, fx] = await Promise.all([
      readMarket(data.token, process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org"),
      getFxQuote(),
    ]);
    const price = Number(market.pools.find((p) => p.supported)?.priceUsd);
    const state = bot.strat_state as {
      tokens?: number;
      costBnb?: number;
      accountingEstimated?: boolean;
    } | null;
    const { botPerformance } = await import("./botPerformance");
    const report = botPerformance(
      orders ?? [],
      Number(state?.costBnb ?? 0),
      Number(state?.tokens ?? 0),
      !market.error && price > 0 ? price : null,
      fx.bnbUsd,
      (journal?.length ?? 0) > 1000,
    );
    return {
      ...report,
      total: state?.accountingEstimated ? null : report.total,
      openEstimated: true,
      at: new Date().toISOString(),
      bnbBrl: fx.bnbUsd && fx.usdBrl ? fx.bnbUsd * fx.usdBrl : null,
      scope:
        "Somente operações atribuídas a este robô por transações registradas; registros legados sem vínculo não entram no resultado.",
    };
  });
