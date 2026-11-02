import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { walletScopeSchema } from "./walletScope";
import { assertWalletScope } from "./walletScope.server";
import { manualAutoInputSchema, buildManualAutoConfig } from "./manualAuto";
import { taxFor } from "./tokens";
import { incompatibleBotToken, INCOMPATIBLE_BNB } from "./guidedBot";
export const saveManualAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        walletScope: walletScopeSchema,
        token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        settings: manualAutoInputSchema,
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
    const { readMarket } = await import("./market.server");
    const market = await readMarket(
      data.token,
      process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org",
      { live: true },
    );
    const price = Number(market.pools.find((p) => p.supported && Number(p.priceUsd) > 0)?.priceUsd);
    if (market.error || !(price > 0) || Date.now() - Date.parse(market.fetchedAt) > 15000)
      throw new Error(
        "Não foi possível obter a referência atual. Seus campos foram mantidos; tente novamente.",
      );
    const taxes = taxFor(data.token, data.settings);
    const config = buildManualAutoConfig(
      { ...data.settings, buyTaxPct: taxes.buy, sellTaxPct: taxes.sell },
      price,
      crypto.randomUUID(),
    );
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
        "Não foi possível salvar: pause o robô e confira se há posição ou transação pendente neste token. As regras de uma posição existente são preservadas. Se outra janela alterou a configuração, reabra o assistente.",
      );
    return {
      id: String(id),
      referenceUsd: price,
      entryUsd:
        config.manualAuto!.entryMode === "price"
          ? config.manualAuto!.entryValue
          : price * (1 - config.manualAuto!.entryValue / 100),
    };
  });
