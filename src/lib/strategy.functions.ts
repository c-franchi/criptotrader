import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { strategySchema } from "./strategyValidation";
import type { Json } from "@/integrations/supabase/types";
export const saveUserStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        config: strategySchema,
        wallet: z
          .string()
          .regex(/^0x[0-9a-fA-F]{40}$/)
          .nullable(),
        version: z.number().int().nonnegative(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("save_user_strategy", {
      p_user: context.userId,
      p_token: data.token,
      p_config: data.config as Json,
      p_wallet: data.wallet,
      p_version: data.version,
    });
    if (error)
      throw new Error(
        "Não foi possível salvar: a estratégia foi alterada, há posição aberta ou uma execução está pendente. Atualize para conferir.",
      );
    return { version: data.version + 1 };
  });
