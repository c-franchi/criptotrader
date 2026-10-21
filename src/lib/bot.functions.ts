import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TOKENS, type TokenInfo } from "./tokens";

/** Built-in tokens plus the ones the user added. */
async function allTokens(userId: string): Promise<TokenInfo[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_tokens")
    .select("address,symbol,name,decimals")
    .eq("user_id", userId);
  if (error) throw new Error("Não foi possível consultar os tokens salvos");
  const extra = (data ?? []).filter(
    (t) => !TOKENS.some((b) => b.address.toLowerCase() === t.address.toLowerCase()),
  ) as TokenInfo[];
  return [...TOKENS, ...extra];
}

export const getBotWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("bot_wallets")
      .select("address")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data)
      return { address: null, bnb: null, tokens: [] as { symbol: string; amount: string }[] };
    const { pubClient } = await import("./bot.server");
    const { erc20Abi } = await import("./pancake");
    const { formatEther, formatUnits } = await import("viem");
    const pub = pubClient();
    const addr = data.address as `0x${string}`;
    const list = await allTokens(context.userId);
    try {
      const bnb = formatEther(await pub.getBalance({ address: addr }));
      const tokens = await Promise.all(
        list.map(async (t) => ({
          symbol: t.symbol,
          amount: formatUnits(
            await pub.readContract({
              address: t.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [addr],
            }),
            t.decimals,
          ),
        })),
      );
      return { address: data.address, bnb, tokens };
    } catch {
      return { address: data.address, bnb: null, tokens: [] };
    }
  });

export const createBotWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ex } = await supabaseAdmin
      .from("bot_wallets")
      .select("address")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (ex) return { address: ex.address };
    const { newEncryptedWallet } = await import("./bot.server");
    const w = await newEncryptedWallet();
    const { error } = await supabaseAdmin
      .from("bot_wallets")
      .insert({ user_id: context.userId, ...w });
    if (error) throw new Error("Não foi possível criar a carteira do robô");
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: "bot_wallet_created",
      details: { address: w.address },
    });
    return { address: w.address };
  });

/** Sends all bot tokens and BNB (minus gas) back to the wallet registered in Estratégia. */
export const withdrawBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to?: string } | undefined) =>
    z
      .object({
        to: z
          .string()
          .regex(/^0x[0-9a-fA-F]{40}$/)
          .optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let to = data.to;
    if (!to) {
      const { data: strat } = await context.supabase
        .from("strategies")
        .select("tracked_wallet")
        .not("tracked_wallet", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      to = strat?.tracked_wallet ?? undefined;
    }
    if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to))
      throw new Error("Escolha uma carteira sua para receber");
    // Anti-theft: funds only go to a wallet saved in "Minhas carteiras" for at least 24h,
    // so a stolen session cannot redirect withdrawals to a fresh attacker address.
    const { data: saved } = await context.supabase
      .from("user_wallets")
      .select("address, created_at")
      .ilike("address", to)
      .maybeSingle();
    if (!saved) throw new Error("Por segurança, o destino precisa estar salvo em Minhas carteiras");
    if (Date.now() - new Date(saved.created_at).getTime() < 24 * 3600 * 1000)
      throw new Error(
        "Por segurança, carteiras novas só podem receber saques 24 horas depois de salvas",
      );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { acquireExecution, releaseExecution } = await import("./executionLock.server");
    const owner = await acquireExecution(supabaseAdmin, context.userId);
    let unresolved = false;
    try {
      const { error: disarmError } = await supabaseAdmin
        .from("grid_bots")
        .update({ armed: false })
        .eq("user_id", context.userId);
      if (disarmError) throw disarmError;
      const { data: bw } = await supabaseAdmin
        .from("bot_wallets")
        .select("enc_key")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!bw) throw new Error("Sem carteira do robô");
      const { contractTransaction, submitTransaction, settleSubmission } =
        await import("./submission.server");
      const { botSigner, pubClient } = await import("./bot.server");
      const { erc20Abi } = await import("./pancake");
      const { account, wallet } = await botSigner(bw.enc_key);
      const pub = pubClient();
      const dest = to as `0x${string}`;
      const hashes: string[] = [];
      for (const t of await allTokens(context.userId)) {
        const b = await pub.readContract({
          address: t.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address],
        });
        if (b > 0n) {
          unresolved = true;
          const intent = { kind: "withdrawal", token: t.address, to: dest, amount: b.toString() };
          const r = await contractTransaction({
            admin: supabaseAdmin,
            userId: context.userId,
            owner,
            pub,
            wallet,
            to: t.address,
            abi: erc20Abi,
            functionName: "transfer",
            args: [dest, b],
            intent,
          });
          if (!r.receipt) throw new Error("Saque enviado; confirmação pendente. Não repita.");
          await settleSubmission(
            supabaseAdmin,
            pub,
            { id: r.id, intent, tx_hash: r.hash },
            r.receipt,
          );
          unresolved = false;
          if (r.receipt.status !== "success")
            throw new Error("Transferência revertida; consulte o histórico");
          const h = r.hash;
          hashes.push(h);
        }
      }
      const gasPrice = await pub.getGasPrice();
      const fee = gasPrice * 21000n * 2n;
      const bal = await pub.getBalance({ address: account.address });
      if (bal > fee) {
        unresolved = true;
        const intent = { kind: "withdrawal", to: dest, amount: (bal - fee).toString() };
        const r = await submitTransaction({
          admin: supabaseAdmin,
          userId: context.userId,
          owner,
          pub,
          wallet,
          to: dest,
          value: bal - fee,
          intent,
        });
        if (!r.receipt) throw new Error("Saque de BNB pendente; aguarde a conciliação");
        await settleSubmission(
          supabaseAdmin,
          pub,
          { id: r.id, intent, tx_hash: r.hash },
          r.receipt,
        );
        unresolved = false;
        if (r.receipt.status !== "success") throw new Error("Saque de BNB revertido");
        hashes.push(r.hash);
      }
      await supabaseAdmin
        .from("audit_log")
        .insert({ user_id: context.userId, action: "bot_withdraw", details: { to, hashes } });
      return { hashes };
    } finally {
      const { data: pending, error } = await supabaseAdmin
        .from("execution_submissions" as never)
        .select("finished_at")
        .eq("lock_owner", owner);
      if (!error && !(pending ?? []).some((p: { finished_at: string | null }) => !p.finished_at))
        await releaseExecution(supabaseAdmin, context.userId, owner);
    }
  });

/** Runs one grid step immediately for the caller's bot on the chosen token. */
export const runGridNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tickBot } = await import("./tick.server");
    const { data: bot } = await supabaseAdmin
      .from("grid_bots")
      .select("*")
      .eq("user_id", context.userId)
      .eq("token", data.token)
      .maybeSingle();
    if (!bot) throw new Error("Salve a grade primeiro");
    return tickBot(supabaseAdmin, bot);
  });

/** Read-only view of the caller's pending submissions; never returns signing material. */
export const getExecutionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lock, error } = await supabaseAdmin
      .from("bot_execution_locks" as never)
      .select("acquired_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar a trava de execução");
    const { data: pending, error: pendingError } = await supabaseAdmin
      .from("execution_submissions" as never)
      .select("tx_hash,created_at")
      .eq("user_id", context.userId)
      .is("finished_at", null)
      .order("created_at")
      .limit(20);
    if (pendingError) throw new Error("Diário de execução indisponível");
    return {
      locked: !!lock,
      pending: (pending ?? []) as { tx_hash: string; created_at: string }[],
    };
  });
