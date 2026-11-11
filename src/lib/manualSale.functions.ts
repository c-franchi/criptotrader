import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manualLimitsSchema, readManualLimits, enforceManualImpact } from "./manualSale";

const selection = z.object({ walletScope: z.string().uuid(), token: z.string().regex(/^0x[\da-fA-F]{40}$/) });
export const getManualSaleLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((v: unknown) => selection.parse(v))
  .handler(async ({ context, data }) => {
    const { readSaleLimits } = await import("./manualSale.server");
    return readSaleLimits(context.supabase, context.userId, data.walletScope, data.token);
  });
export const saveManualSaleLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((v: unknown) => selection.extend({ limits: manualLimitsSchema }).parse(v))
  .handler(async ({ context, data }) => {
    const { assertManualScope } = await import("./manualSale.server");
    await assertManualScope(context.supabase, context.userId, data.walletScope);
    const { error } = await context.supabase.from("manual_sale_limits").upsert({
      user_id: context.userId, wallet_scope: data.walletScope, token: data.token.toLowerCase(),
      max_price_impact_pct: data.limits.maxPriceImpactPct, max_slippage_pct: data.limits.maxSlippagePct,
    }, { onConflict: "user_id,wallet_scope,token" });
    if (error) throw new Error("Não foi possível salvar os limites. Nenhuma regra do robô foi alterada.");
    return data.limits;
  });
export const validateManualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator((v: unknown) => selection.extend({ amount: z.string().regex(/^\d+$/), limits: manualLimitsSchema }).parse(v))
  .handler(async ({ context, data }) => {
    const { readSaleLimits } = await import("./manualSale.server");
    const current = await readSaleLimits(context.supabase, context.userId, data.walletScope, data.token);
    const limits = readManualLimits(current.limits);
    if (!limits || limits.maxPriceImpactPct !== data.limits.maxPriceImpactPct || limits.maxSlippagePct !== data.limits.maxSlippagePct)
      throw new Error("Os limites mudaram ou estão ausentes. Revise os limites e cote novamente.");
    const { pubClient } = await import("./bot.server");
    const { getAddress } = await import("viem");
    const { PANCAKE_V2_FACTORY, WBNB, ZERO, factoryAbi, pairAbi, priceImpactPct } = await import("./pancake");
    const pub = pubClient();
    const blockNumber = await pub.getBlockNumber();
    const pool = await pub.readContract({ address: PANCAKE_V2_FACTORY, abi: factoryAbi, functionName: "getPair", args: [getAddress(data.token), WBNB], blockNumber });
    if (pool === ZERO) throw new Error("Pool indisponível para esta venda.");
    const [reserves, token0] = await Promise.all([
      pub.readContract({ address: pool, abi: pairAbi, functionName: "getReserves", blockNumber }),
      pub.readContract({ address: pool, abi: pairAbi, functionName: "token0", blockNumber }),
    ]);
    const amount = BigInt(data.amount);
    if (amount <= 0n) throw new Error("Informe uma quantidade maior que zero.");
    const impact = priceImpactPct(amount, token0.toLowerCase() === data.token.toLowerCase() ? reserves[0] : reserves[1]);
    enforceManualImpact(impact, limits);
    return { impact, limits };
  });