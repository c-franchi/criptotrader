import { BeforeBroadcastError, BeforeSigningError } from "./executionPhase";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { runGridStep } from "./bot.server";
import { reconcileSubmissions } from "./submission.server";
import { TOKENS } from "./tokens";
import { acquireExecution, reconcileLocks, releaseExecution } from "./executionLock.server";

export async function tickBot(admin: any, bot: any) {
  let owner: string;
  try {
    owner = await acquireExecution(admin, bot.user_id);
  } catch {
    const reason = "Execução bloqueada: carteira em uso ou operação anterior sem conciliação";
    const { error } = await admin.from("grid_bots").update({ last_error: reason }).eq("id", bot.id);
    if (error) throw error;
    // Do not advance last_run_at: no strategy evaluation took place.
    return { ok: false, blocked: true, action: "nenhuma", reason };
  }
  let retain = false;
  try {
    const { data: current, error: currentError } = await admin
      .from("grid_bots")
      .select("*")
      .eq("id", bot.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current?.armed) return { ok: false, action: "nenhuma", reason: "Robô desligado" };
    bot = current;
    const { data: bw } = await admin
      .from("bot_wallets")
      .select("enc_key")
      .eq("user_id", bot.user_id)
      .maybeSingle();
    if (!bw) {
      await admin
        .from("grid_bots")
        .update({ last_error: "Sem carteira do robô", last_run_at: new Date().toISOString() })
        .eq("id", bot.id);
      return { ok: false, action: "nenhuma" };
    }
    let res: { patch: Record<string, unknown>; order: any };
    try {
      if (bot.mode === "grade") res = await runGridStep(bot, bw.enc_key, admin, owner);
      else {
        const { runStrategyStep } = await import("./strategyBot.server");
        res = await runStrategyStep(admin, bot, bw.enc_key, owner);
      }
    } catch (e) {
      retain = !(e instanceof BeforeSigningError || e instanceof BeforeBroadcastError); // Retain uncertain signing failures; release proven read-only failures.
      res = {
        patch: {
          last_error: (((e as Error).message ?? "erro").split("\n")[0] ?? "erro").slice(0, 300),
        },
        order: null,
      };
    }
    if (res.order) {
      retain = true;
      // The execution journal persists orders and position state atomically.
      const { error: stateError } = await admin
        .from("grid_bots")
        .update({ ...res.patch, last_run_at: new Date().toISOString() })
        .eq("id", bot.id);
      if (stateError) throw stateError;
      retain = res.order.status === "enviada";
      const { data: t } = await admin
        .from("user_tokens")
        .select("symbol")
        .eq("user_id", bot.user_id)
        .ilike("address", bot.token)
        .maybeSingle();
      const ok = res.order.status === "confirmada";
      const title = ok
        ? `Robô ${res.order.side === "compra" ? "comprou" : "vendeu"} ${TOKENS.find((x) => x.address.toLowerCase() === String(bot.token).toLowerCase())?.symbol ?? t?.symbol ?? "token"}`
        : res.order.status === "enviada"
          ? "Robô: confirmação pendente"
          : `Robô: ${res.order.side} falhou`;
      const body = ok
        ? String(res.patch["last_reason"] ?? "Seguindo sua estratégia.")
        : String(res.order.error ?? "Nada foi trocado.");
      await admin
        .from("notifications")
        .insert({ user_id: bot.user_id, title, body, link: "/grade" });
      // Notification outbox is delivered by alert-tick, independently of execution.
    }
    const { error: patchError } = await admin
      .from("grid_bots")
      .update({ ...res.patch, last_run_at: new Date().toISOString() })
      .eq("id", bot.id);
    if (patchError) {
      retain = true;
      throw patchError;
    }
    return {
      ok: !res.patch["last_error"],
      action: res.order?.side ?? "nenhuma",
      status: res.order?.status ?? null,
      error: (res.patch["last_error"] as string | null) ?? null,
      reason: (res.patch["last_reason"] as string | null) ?? null,
    };
  } finally {
    const { data: pending, error } = await admin
      .from("execution_submissions")
      .select("finished_at")
      .eq("lock_owner", owner);
    if (
      !error &&
      (!retain || pending?.length > 0) &&
      !(pending ?? []).some((p: any) => !p.finished_at)
    ) {
      await releaseExecution(admin, bot.user_id, owner);
    }
  }
}

export async function tickAll(admin: any) {
  let reconciliationOk = true;
  try {
    const { pubClient } = await import("./bot.server");
    const pub = pubClient();
    await reconcileSubmissions(admin, pub);
    await reconcileLocks(admin, async (hash) => {
      try {
        return await pub.getTransactionReceipt({ hash });
      } catch (e) {
        if ((e as Error).name === "TransactionReceiptNotFoundError") return null;
        throw e;
      }
    });
  } catch {
    reconciliationOk = false; // Expose degraded reconciliation to the scheduler monitor.
  }
  const { data: bots, error: botsError } = await admin
    .from("grid_bots")
    .select("*")
    .eq("armed", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(20);
  if (botsError) throw botsError;
  const out: { ok: boolean; blocked?: boolean; reason?: string | null }[] = [];
  const started = Date.now();
  for (const b of bots ?? []) {
    if (Date.now() - started > 40_000) break;
    try {
      out.push(await tickBot(admin, b));
    } catch {
      out.push({ ok: false, reason: "Falha isolada; próxima execução tentará conciliar" });
    }
  }
  const blocked = out.filter((r) => r.blocked).length;
  const failed = out.filter((r) => !r.ok && !r.blocked).length;
  return {
    ok: reconciliationOk && blocked === 0 && failed === 0 && out.length === (bots ?? []).length,
    attempted: out.length,
    evaluated: out.filter((r) => r.ok).length,
    blocked,
    failed,
    deferred: (bots ?? []).length - out.length,
    reconciliationOk,
  };
}
