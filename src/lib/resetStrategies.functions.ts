import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { walletScopeSchema } from "./walletScope";
import { assertWalletScope } from "./walletScope.server";

export const resetStrategies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        walletScope: walletScopeSchema,
        allWallets: z.boolean(),
        confirmation: z.literal("RESETAR ESTRATÉGIAS"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(supabaseAdmin, context.userId, data.walletScope);
    const { error } = await supabaseAdmin.rpc(
      "reset_strategy_configuration" as never,
      { p_user: context.userId, p_scope: data.allWallets ? null : data.walletScope } as never,
    );
    if (error)
      throw new Error(
        /posição aberta|transação pendente/i.test(error.message)
          ? error.message
          : "Não foi possível resetar. Nenhuma alteração foi confirmada; atualize o estado.",
      );
    return { ok: true };
  });
