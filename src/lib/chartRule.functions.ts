import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { walletScopeSchema } from "./walletScope";
import { assertWalletScope } from "./walletScope.server";
import { buildChartConfig, chartRuleInputSchema, chartProjection } from "./chartRule";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";
import { incompatibleBotToken, INCOMPATIBLE_BNB } from "./guidedBot";
import {
  chartPlanInputSchema,
  buildChartPlanConfig,
  dividePlanBudget,
  planProjection,
  planPartialScenarios,
} from "./chartPlan";
const selection = z.object({
  walletScope: walletScopeSchema,
  token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

/** Read-only fee references; gas units are explicitly estimates, not a successful sell simulation. */
export const getChartGasReference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => selection.parse(data))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const { pubClient } = await import("./bot.server");
    const gasPrice = await pubClient().getGasPrice();
    const { formatEther } = await import("viem");
    return {
      gasBuyBnb: formatEther(gasPrice * 300000n),
      gasSellBnb: formatEther(gasPrice * 460000n),
      at: new Date().toISOString(),
      buyUnits: 300000,
      sellUnits: 460000,
    };
  });

export const saveChartRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    selection
      .extend({
        settings: chartRuleInputSchema,
        version: z.number().int().nonnegative(),
        draftRevision: z.number().int().nonnegative(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    if (incompatibleBotToken(data.token)) throw new Error(INCOMPATIBLE_BNB);
    const projection = chartProjection({ ...data.settings }, data.settings.exitBnb);
    if (!projection || !(projection.profitBnb > 0))
      throw new Error("A saída marcada não cobre os custos estimados. Revise a saída e os custos.");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const { data: saved, error: readError } = await admin
      .from("strategies")
      .select("config")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .ilike("token", data.token)
      .maybeSingle();
    if (readError) throw new Error("Não foi possível conferir a estratégia existente.");
    const config = buildChartConfig(data.settings, crypto.randomUUID(), {
      ...EMPTY_CONFIG,
      ...((saved?.config as Partial<StrategyConfig>) ?? {}),
    });
    const { strategySchema } = await import("./strategyValidation");
    strategySchema.parse(config);
    // The existing atomic RPC enforces wallet-wide locks, version/draft fences,
    // paused/no-position replacement and creates the bot paused. Never arms it.
    const { data: id, error } = await admin.rpc(
      "configure_guided_bot" as never,
      {
        p_user: context.userId,
        p_scope: data.walletScope,
        p_token: data.token,
        p_config: config,
        p_version: data.version,
        p_draft_revision: data.draftRevision,
        p_grid: { lower: 0, upper: 0, levels: 10 },
      } as never,
    );
    if (error)
      throw new Error(
        "Não foi possível salvar a regra gráfica. Pause o robô e confira posições e operações pendentes; se os dados mudaram em outra janela, reabra a ferramenta. Seus pontos continuam nesta tela.",
      );
    return { id: String(id), version: data.version + 1 };
  });

export const saveChartPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    selection
      .extend({
        settings: chartPlanInputSchema,
        version: z.number().int().nonnegative(),
        draftRevision: z.number().int().nonnegative(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    if (incompatibleBotToken(data.token)) throw new Error(INCOMPATIBLE_BNB);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const [strategy, wallet] = await Promise.all([
      admin
        .from("strategies")
        .select("config")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .ilike("token", data.token)
        .maybeSingle(),
      admin
        .from("bot_wallets")
        .select("address")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .maybeSingle(),
    ]);
    if (strategy.error || wallet.error)
      throw new Error("Não foi possível conferir o saldo liberado desta carteira.");
    if (!wallet.data?.address)
      throw new Error(
        "Crie e abasteça a carteira automática antes de escolher o valor da atividade.",
      );
    const { pubClient } = await import("./bot.server");
    const { formatEther, parseEther, getAddress } = await import("viem");
    const balance = formatEther(
      await pubClient().getBalance({ address: getAddress(wallet.data.address) }),
    );
    const { readWalletCapital } = await import("./walletCapital.server");
    const capital = await readWalletCapital(admin, context.userId, data.walletScope, balance);
    if (parseEther(data.settings.budgetBnb) > parseEther(capital.free))
      throw new Error(
        "O valor escolhido supera o saldo livre atual. Atualize o disponível; outros robôs podem ter reservado parte dele.",
      );
    const config = buildChartPlanConfig(data.settings, crypto.randomUUID(), {
      ...EMPTY_CONFIG,
      ...((strategy.data?.config as Partial<StrategyConfig>) ?? {}),
    });
    const rule = config.chartRule!;
    const allocation = dividePlanBudget(
      data.settings.budgetBnb,
      rule.entries!.length,
      rule.exits!.length,
      rule.gasBuyBnb,
      rule.gasSellBnb,
    )!;
    const model = {
      ...data.settings,
      entryPrices: rule.entries!.map((e) => e.priceBnb),
      exitPrices: rule.exits!.map((e) => e.priceBnb),
      amounts: allocation.amounts,
    };
    const projection = planProjection(model);
    if (!projection || projection.profit <= 0)
      throw new Error(
        "As saídas escolhidas não cobrem as taxas e o gás estimados com todas as entradas. Revise o detalhamento; seus preços não foram alterados.",
      );
    if (
      planPartialScenarios(model).some((s) => !s.projection || s.projection.profit <= 0) &&
      !data.settings.partialEntriesAccepted
    )
      throw new Error(
        "Confirme que entende o resultado com entradas incompletas. Seus preços de saída foram mantidos.",
      );
    const { strategySchema } = await import("./strategyValidation");
    strategySchema.parse(config);
    const { data: id, error } = await admin.rpc(
      "configure_guided_bot" as never,
      {
        p_user: context.userId,
        p_scope: data.walletScope,
        p_token: data.token,
        p_config: config,
        p_version: data.version,
        p_draft_revision: data.draftRevision,
        p_grid: { lower: 0, upper: 0, levels: 10 },
      } as never,
    );
    if (error)
      throw new Error(
        "Não foi possível salvar a atividade. Pause o robô e confira posições, operações pendentes e alterações feitas em outra janela. O rascunho foi mantido.",
      );
    return { id: String(id), version: data.version + 1 };
  });
