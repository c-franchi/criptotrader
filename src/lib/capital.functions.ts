import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { walletScopeSchema } from "./walletScope";
import { assertWalletScope } from "./walletScope.server";

export const getWalletCapital = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ walletScope: walletScopeSchema, previewId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(supabaseAdmin, context.userId, data.walletScope);
    const { data: wallet, error } = await supabaseAdmin
      .from("bot_wallets")
      .select("address")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .maybeSingle();
    if (error) throw new Error("Carteira indisponível");
    if (!wallet) return null;
    const { pubClient } = await import("./bot.server");
    const { formatEther } = await import("viem");
    const { readWalletCapital } = await import("./walletCapital.server");
    const balance = formatEther(
      await pubClient().getBalance({ address: wallet.address as `0x${string}` }),
    );
    const capital = await readWalletCapital(
      supabaseAdmin,
      context.userId,
      data.walletScope,
      balance,
      data.previewId,
    );
    return { ...capital, address: wallet.address, at: new Date().toISOString() };
  });
