import { runGridStep } from "./bot.server";
import { TOKENS } from "./tokens";
import { acquireExecution, reconcileLocks, releaseExecution } from "./executionLock.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tickBot(admin: any, bot: any) {
  let owner: string;
  try { owner = await acquireExecution(admin, bot.user_id); } catch { return { ok: false, action: "nenhuma", reason: "Carteira em execução ou confirmação pendente" }; }
  let retain = false;
  try {
  const { data: current, error: currentError } = await admin.from("grid_bots").select("*").eq("id", bot.id).maybeSingle();
  if (currentError) throw currentError;
  if (!current?.armed) return { ok: false, action: "nenhuma", reason: "Robô desligado" };
  bot = current;
  const { data: bw } = await admin.from("bot_wallets").select("enc_key").eq("user_id", bot.user_id).maybeSingle();
  if (!bw) {
    await admin.from("grid_bots").update({ last_error: "Sem carteira do robô", last_run_at: new Date().toISOString() }).eq("id", bot.id);
    return { ok: false, action: "nenhuma" };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let res: { patch: Record<string, unknown>; order: any };
  try {
    if (bot.mode === "grade") res = await runGridStep(bot, bw.enc_key);
    else {
      const { runStrategyStep } = await import("./strategyBot.server");
      res = await runStrategyStep(admin, bot, bw.enc_key);
    }
  } catch (e) {
    retain = true; // A signing/provider error may happen after submission. Never assume no funds moved.
    res = { patch: { last_error: (((e as Error).message ?? "erro").split("\n")[0] ?? "erro").slice(0, 300) }, order: null };
  }
  if (res.order) {
    retain = true;
    const { error: orderError } = await admin.from("orders").insert(res.order);
    if (orderError) throw orderError;
    const { error: stateError } = await admin.from("grid_bots").update({ ...res.patch, last_run_at: new Date().toISOString() }).eq("id", bot.id);
    if (stateError) throw stateError;
    retain = res.order.status === "enviada";
    const { data: t } = await admin.from("user_tokens").select("symbol").eq("user_id", bot.user_id).ilike("address", bot.token).maybeSingle();
    const ok = res.order.status === "confirmada";
    const title = ok ? `Robô ${res.order.side === "compra" ? "comprou" : "vendeu"} ${TOKENS.find((x) => x.address.toLowerCase() === String(bot.token).toLowerCase())?.symbol ?? t?.symbol ?? "token"}` : res.order.status === "enviada" ? "Robô: confirmação pendente" : `Robô: ${res.order.side} falhou`;
    const body = ok ? String(res.patch["last_reason"] ?? "Seguindo sua estratégia.") : String(res.order.error ?? "Nada foi trocado.");
    await admin.from("notifications").insert({ user_id: bot.user_id, title, body, link: "/grade" });
    const { pushToUser } = await import("./pushSend.server");
    try { await pushToUser(admin, bot.user_id, title, body, "/grade"); } catch { /* Notification delivery must never roll back a confirmed execution. */ }
  }
  const { error: patchError } = await admin.from("grid_bots").update({ ...res.patch, last_run_at: new Date().toISOString() }).eq("id", bot.id);
  if (patchError) { retain = true; throw patchError; }
  return { ok: !res.patch["last_error"], action: res.order?.side ?? "nenhuma", status: res.order?.status ?? null, error: (res.patch["last_error"] as string | null) ?? null, reason: (res.patch["last_reason"] as string | null) ?? null };
  } finally { if (!retain) await releaseExecution(admin, bot.user_id, owner); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tickAll(admin: any) {
  try {
    const { pubClient } = await import("./bot.server");
    const pub = pubClient();
    await reconcileLocks(admin, async (hash) => {
      try { return await pub.getTransactionReceipt({ hash }); }
      catch (e) { if ((e as Error).name === "TransactionReceiptNotFoundError") return null; throw e; }
    });
  } catch { /* reconciliation is best-effort; ticks continue */ }
  const { data: bots } = await admin.from("grid_bots").select("*").eq("armed", true).limit(200);
  const out = [];
  for (const b of bots ?? []) out.push(await tickBot(admin, b));
  return out.length;
}
