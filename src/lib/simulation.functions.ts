import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Decimal from "decimal.js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { simBuy, simSell, DEFAULT_ASSUMPTIONS } from "./sim";
import { taxFor } from "./tokens";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const createSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        token: address,
        amount: z
          .string()
          .max(100)
          .refine((s) => {
            try {
              return (
                new Decimal(s).isFinite() && new Decimal(s).gt(0) && new Decimal(s).lte(1000000)
              );
            } catch {
              return false;
            }
          }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sim_accounts").insert({
      user_id: context.userId,
      token: data.token.toLowerCase(),
      quote_symbol: "WBNB",
      initial_quote: data.amount,
      quote_balance: data.amount,
    } as never);
    if (error)
      throw new Error(
        error.code === "23505"
          ? "Já existe simulação ativa deste token"
          : "Não foi possível criar a simulação",
      );
  });
export const archiveSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sim_accounts")
      .update({ archived: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Não foi possível arquivar");
  });
export const tradeSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        requestId: z.string().uuid(),
        revision: z.number().int().nonnegative(),
        token: address,
        side: z.enum(["compra", "venda"]),
        amount: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account, error } = await supabaseAdmin
      .from("sim_accounts")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (
      error ||
      !account ||
      account.archived ||
      account.token?.toLowerCase() !== data.token.toLowerCase()
    )
      throw new Error("Simulação inválida ou de outro token");
    const { readMarket } = await import("./market.server");
    const market = await readMarket(
      data.token,
      process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org",
    );
    const pool = market.pools.find((p) => p.supported);
    if (
      !pool?.priceNative ||
      market.error ||
      Date.now() - new Date(market.fetchedAt).getTime() > 60_000
    )
      throw new Error("Aguardando cotação atual do pool WBNB");
    const price = new Decimal(pool.priceNative),
      amount = new Decimal(data.amount);
    if (!amount.isFinite() || !amount.gt(0) || (data.side === "venda" && amount.gt(100)))
      throw new Error("Valor ou percentual inválido");
    const state = {
      quote: new Decimal(account.quote_balance),
      tokens: new Decimal(account.token_balance),
      costBasis: new Decimal(account.cost_basis),
      realized: new Decimal(account.realized_pnl),
      fees: new Decimal(account.fees_paid),
    };
    const { data: strategy } = await context.supabase
      .from("strategies")
      .select("config")
      .ilike("token", data.token)
      .maybeSingle();
    const tax = taxFor(
      data.token,
      strategy?.config as { buyTaxPct?: number; sellTaxPct?: number } | undefined,
    );
    const assumptions = { ...DEFAULT_ASSUMPTIONS, buyTaxPct: tax.buy, sellTaxPct: tax.sell };
    const r =
      data.side === "compra"
        ? simBuy(state, amount, price, assumptions)
        : simSell(state, amount, price, assumptions);
    const { error: writeError } = await supabaseAdmin.rpc("apply_sim_trade", {
      p_user: context.userId,
      p_account: account.id,
      p_revision: data.revision,
      p_request: data.requestId,
      p_token: data.token,
      p_next: Object.fromEntries(Object.entries(r.next).map(([k, v]) => [k, v.toString()])),
      p_trade: {
        side: data.side,
        price: price.toString(),
        quote_amount:
          data.side === "compra"
            ? amount.toString()
            : (r as ReturnType<typeof simSell>).proceeds.toString(),
        token_amount: r.tokens.toString(),
        fee: r.fee.toString(),
        gas_estimate: assumptions.gasQuote,
        slippage_pct: assumptions.slippagePct,
        realized_pnl: r.realized.toString(),
        pair_address: pool.pairAddress,
      },
    });
    if (writeError)
      throw new Error("A simulação mudou ou não pôde ser salva. Atualize antes de repetir.");
  });
