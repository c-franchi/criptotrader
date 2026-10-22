import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { strategySchema } from "./strategyValidation";
import { persistStrategy, type StrategyRpcClient } from "./strategyPersistence.server";
import type { StrategyConfig } from "./strategy";
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
        draftRevision: z.number().int().nonnegative().default(0),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return persistStrategy(supabaseAdmin as unknown as StrategyRpcClient, context.userId, {
      token: data.token,
      config: data.config as Json,
      wallet: data.wallet,
      version: data.version,
      draftRevision: data.draftRevision,
    });
  });

export const getStrategyDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: draft, error } = await supabaseAdmin
      .from("strategy_drafts" as never)
      .select("config,tracked_wallet,base_version,revision")
      .eq("user_id", context.userId)
      .eq("token", data.token.toLowerCase())
      .maybeSingle();
    if (error) throw new Error("Não foi possível recuperar o rascunho salvo.");
    if (!draft) return null;
    const row = draft as unknown as {
      config: unknown;
      tracked_wallet: string | null;
      base_version: number;
      revision: number;
    };
    return { ...row, config: strategySchema.parse(row.config) as unknown as StrategyConfig };
  });
