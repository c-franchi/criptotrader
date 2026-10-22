import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { walletScopeSchema } from "./walletScope";
import { assertWalletScope } from "./walletScope.server";

export const removePausedBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        walletScope: walletScopeSchema,
        botId: z.string().uuid(),
        confirmation: z.literal("REMOVER ROBÔ"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(supabaseAdmin, context.userId, data.walletScope);
    const { error } = await supabaseAdmin.rpc(
      "remove_paused_bot" as never,
      { p_user: context.userId, p_scope: data.walletScope, p_bot: data.botId } as never,
    );
    if (error)
      throw new Error(
        /Pause o robô|posição aberta|transação pendente|não encontrado/i.test(error.message)
          ? error.message
          : "Não foi possível remover o robô. Atualize o estado e tente novamente.",
      );
    return { ok: true };
  });
