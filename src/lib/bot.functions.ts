import { botWithdrawalSchema, withdrawalDestination, withdrawalReserve } from "./botWithdrawal";
import { walletScopeSchema } from "./walletScope";
import { assertWalletScope } from "./walletScope.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TOKENS, type TokenInfo } from "./tokens";

/** Tokens known to this user and this robot group, including archived configurations. */
type DiscoveredToken = TokenInfo & { metadataUnavailable?: boolean };
async function allTokens(userId: string, scope: string): Promise<DiscoveredToken[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [added, bots] = await Promise.all([
    supabaseAdmin.from("user_tokens").select("address,symbol,name,decimals").eq("user_id", userId),
    supabaseAdmin.from("grid_bots").select("token").eq("user_id", userId).eq("wallet_scope", scope),
  ]);
  if (added.error || bots.error)
    throw new Error("Não foi possível consultar todos os tokens cadastrados e usados pelos robôs");
  const list = new Map<string, DiscoveredToken>(TOKENS.map((t) => [t.address.toLowerCase(), t]));
  for (const t of added.data ?? [])
    if (!list.has(t.address.toLowerCase())) list.set(t.address.toLowerCase(), t as TokenInfo);
  const { tokenMeta } = await import("./tokenMeta.server");
  for (const b of bots.data ?? []) {
    if (list.has(b.token.toLowerCase())) continue;
    try {
      list.set(b.token.toLowerCase(), await tokenMeta(b.token));
    } catch {
      list.set(b.token.toLowerCase(), {
        address: b.token as `0x${string}`,
        symbol: `${b.token.slice(0, 6)}…${b.token.slice(-4)}`,
        name: "Token com metadados indisponíveis",
        decimals: 0,
        metadataUnavailable: true,
      });
    }
  }
  return [...list.values()];
}

export const getBotWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { walletScope?: string } | undefined) =>
    z.object({ walletScope: walletScopeSchema }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(supabaseAdmin, context.userId, data.walletScope);
    const { data: bw, error: walletError } = await supabaseAdmin
      .from("bot_wallets")
      .select("address")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .maybeSingle();
    if (walletError) throw new Error("Não foi possível consultar a carteira do robô");
    if (!bw)
      return {
        address: null,
        bnb: null,
        tokens: [] as { address: string; symbol: string; amount: string }[],
      };
    const { pubClient } = await import("./bot.server");
    const { erc20Abi } = await import("./pancake");
    const { formatEther, formatUnits } = await import("viem");
    const pub = pubClient();
    const addr = bw.address as `0x${string}`;
    const list = await allTokens(context.userId, data.walletScope);
    try {
      const bnb = await pub
        .getBalance({ address: addr })
        .then(formatEther)
        .catch(() => null);
      const tokens = await Promise.all(
        list.map(async (t) => {
          if (t.metadataUnavailable)
            return { address: t.address, symbol: t.symbol, amount: "", unavailable: true };
          try {
            return {
              address: t.address,
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
            };
          } catch {
            return { address: t.address, symbol: t.symbol, amount: "", unavailable: true };
          }
        }),
      );
      return { address: bw.address, bnb, tokens };
    } catch {
      return { address: bw.address, bnb: null, tokens: [] };
    }
  });

export const createBotWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { walletScope?: string } | undefined) =>
    z.object({ walletScope: walletScopeSchema }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(supabaseAdmin, context.userId, data.walletScope);
    const { data: ex } = await supabaseAdmin
      .from("bot_wallets")
      .select("address")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .maybeSingle();
    if (ex) return { address: ex.address };
    const { newEncryptedWallet } = await import("./bot.server");
    const w = await newEncryptedWallet();
    const { error } = await supabaseAdmin
      .from("bot_wallets")
      .insert({ user_id: context.userId, wallet_scope: data.walletScope, ...w });
    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabaseAdmin
          .from("bot_wallets")
          .select("address")
          .eq("user_id", context.userId)
          .eq("wallet_scope", data.walletScope)
          .maybeSingle();
        if (existing) return { address: existing.address };
      }
      throw new Error("Não foi possível criar a carteira do robô");
    }
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: "bot_wallet_created",
      details: { address: w.address, wallet_scope: data.walletScope },
    });
    return { address: w.address };
  });

/** Returns explicitly selected assets, using the existing durable journal and wallet mutex. */
export const withdrawBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => botWithdrawalSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const { data: saved, error: savedError } = await admin
      .from("user_wallets")
      .select("id,address,created_at")
      .eq("user_id", context.userId);
    if (savedError)
      throw new Error("Não foi possível verificar a carteira de destino. Nada foi enviado.");
    const to = withdrawalDestination(data.walletScope, data.to, saved ?? []);
    const destination = saved!.find((w) => w.address.toLowerCase() === to.toLowerCase())!;
    if (
      !Number.isFinite(new Date(destination.created_at).getTime()) ||
      Date.now() - new Date(destination.created_at).getTime() < 24 * 3600 * 1000
    )
      throw new Error(
        "Por segurança, carteiras novas só podem receber saques 24 horas depois de salvas",
      );
    const { acquireExecution, releaseExecution } = await import("./executionLock.server");
    const owner = await acquireExecution(admin, context.userId, data.walletScope);
    try {
      const { data: bw, error: walletError } = await admin
        .from("bot_wallets")
        .select("address,enc_key")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .maybeSingle();
      if (walletError || !bw) throw new Error("Carteira automática não encontrada neste grupo.");
      if (data.from && data.from.toLowerCase() !== bw.address.toLowerCase())
        throw new Error(
          "A carteira de origem mudou. Atualize antes de devolver; nada foi enviado.",
        );
      if (bw.address.toLowerCase() === to.toLowerCase())
        throw new Error(
          "Origem e destino são iguais. Escolha a carteira pessoal, não a automática.",
        );
      const list = await allTokens(context.userId, data.walletScope);
      const { error: disarmError } = await admin
        .from("grid_bots")
        .update({ armed: false })
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope);
      if (disarmError) throw disarmError;
      const { botSigner, pubClient } = await import("./bot.server");
      const { wallet, account } = await botSigner(bw.enc_key);
      if (account.address.toLowerCase() !== bw.address.toLowerCase())
        throw new Error("Identidade da carteira automática inconsistente. Nada foi enviado.");
      const { returnBotAssets } = await import("./botWithdrawal.server");
      const result = await returnBotAssets({
        admin,
        pub: pubClient(),
        wallet,
        userId: context.userId,
        owner,
        scope: data.walletScope,
        from: account.address,
        to,
        tokens: list,
        ...(data.assets ? { assets: data.assets } : {}),
        keepBnb: withdrawalReserve(data.keepBnb),
      });
      const { error: auditError } = await admin.from("audit_log").insert({
        user_id: context.userId,
        action: result.status === "failed" ? "bot_withdraw_failed" : "bot_withdraw",
        details: {
          wallet_scope: data.walletScope,
          from: bw.address,
          to,
          assets: data.assets ?? "known-assets",
          hashes: result.hashes,
          status: result.status,
          message: result.message,
        },
      });
      return {
        ...result,
        message:
          result.message +
          (auditError
            ? " O resumo não pôde ser salvo; consulte os hashes no histórico de devoluções."
            : ""),
      };
    } catch (e) {
      await admin.from("audit_log").insert({
        user_id: context.userId,
        action: "bot_withdraw_failed",
        details: {
          wallet_scope: data.walletScope,
          from: data.from,
          to,
          message: e instanceof Error ? e.message : "Falha na devolução",
          hashes: [],
        },
      });
      throw e;
    } finally {
      const { data: pending, error } = await admin
        .from("execution_submissions")
        .select("finished_at")
        .eq("user_id", context.userId)
        .eq("lock_owner", owner);
      if (!error && !(pending ?? []).some((p) => !p.finished_at))
        await releaseExecution(admin, context.userId, owner);
    }
  });

export const getBotWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        walletScope: walletScopeSchema,
        limit: z.number().int().min(1).max(200).default(30),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(admin, context.userId, data.walletScope);
    const [rows, failures, meta, wallet] = await Promise.all([
      admin
        .from("execution_submissions")
        .select("id,tx_hash,intent,created_at,finished_at,receipt")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .eq("intent->>kind", "withdrawal")
        .order("created_at", { ascending: false })
        .limit(data.limit),
      admin
        .from("audit_log")
        .select("id,created_at,details")
        .eq("user_id", context.userId)
        .eq("action", "bot_withdraw_failed")
        .eq("details->>wallet_scope", data.walletScope)
        .order("created_at", { ascending: false })
        .limit(data.limit),
      admin.from("user_tokens").select("address,symbol,decimals").eq("user_id", context.userId),
      admin
        .from("bot_wallets")
        .select("address")
        .eq("user_id", context.userId)
        .eq("wallet_scope", data.walletScope)
        .maybeSingle(),
    ]);
    if (rows.error || failures.error)
      throw new Error("Não foi possível carregar o histórico de devoluções.");
    const { withdrawalHistoryRow } = await import("./botWithdrawalHistory");
    return {
      rows: (rows.data ?? []).map((row) =>
        withdrawalHistoryRow(row, [...TOKENS, ...(meta.data ?? [])], wallet.data?.address),
      ),
      failures: (failures.data ?? []).map((row) => {
        const d = (row.details ?? {}) as Record<string, unknown>;
        return {
          id: row.id,
          createdAt: row.created_at,
          message:
            typeof d["message"] === "string" ? d["message"] : "Tentativa sem envio confirmado",
          from: typeof d["from"] === "string" ? d["from"] : null,
          to: typeof d["to"] === "string" ? d["to"] : null,
        };
      }),
      hasMore:
        (rows.data?.length ?? 0) === data.limit || (failures.data?.length ?? 0) === data.limit,
    };
  });

/** Runs one grid step immediately for the caller's bot on the chosen token. */
export const runGridNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; walletScope?: string }) =>
    z
      .object({ token: z.string().regex(/^0x[0-9a-fA-F]{40}$/), walletScope: walletScopeSchema })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tickBot } = await import("./tick.server");
    const { data: bot } = await supabaseAdmin
      .from("grid_bots")
      .select("*")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .eq("token", data.token)
      .is("archived_at", null)
      .maybeSingle();
    if (!bot) throw new Error("Salve a grade primeiro");
    return tickBot(supabaseAdmin, bot);
  });

/** Read-only view of the caller's pending submissions; never returns signing material. */
export const getExecutionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { walletScope?: string } | undefined) =>
    z.object({ walletScope: walletScopeSchema }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertWalletScope(supabaseAdmin, context.userId, data.walletScope);
    const { data: lock, error } = await supabaseAdmin
      .from("bot_execution_locks" as never)
      .select("acquired_at")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar o estado das operações");
    const { data: pending, error: pendingError } = await supabaseAdmin
      .from("execution_submissions" as never)
      .select("tx_hash,created_at")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .is("finished_at", null)
      .order("created_at")
      .limit(20);
    if (pendingError) throw new Error("Diário de execução indisponível");
    return {
      locked: !!lock,
      lockAcquiredAt: lock ? (lock as { acquired_at: string }).acquired_at : null,
      pending: (pending ?? []) as { tx_hash: string; created_at: string }[],
    };
  });

/** Read-only observation; never acquires/releases locks, signs or changes bot state. */
export const getBotAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; walletScope?: string }) =>
    z
      .object({ token: z.string().regex(/^0x[0-9a-fA-F]{40}$/), walletScope: walletScopeSchema })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: bot, error } = await admin
      .from("grid_bots")
      .select("*")
      .eq("user_id", context.userId)
      .eq("wallet_scope", data.walletScope)
      .ilike("token", data.token)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error("Não foi possível consultar o robô");
    if (!bot)
      return {
        at: new Date().toISOString(),
        reason: "Nenhum robô configurado para este ativo.",
        error: null as string | null,
      };
    const result =
      bot.mode === "grade"
        ? await (await import("./bot.server")).runGridStep(bot, "", admin, "", true)
        : await (await import("./strategyBot.server")).runStrategyStep(admin, bot, "", "", true);
    const patch = result.patch as Record<string, unknown>;
    return {
      at: new Date().toISOString(),
      reason:
        typeof patch["last_reason"] === "string"
          ? patch["last_reason"]
          : "Aguardando dados para analisar.",
      error: typeof patch["last_error"] === "string" ? patch["last_error"] : null,
    };
  });
