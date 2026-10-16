import { runGridStep } from "./bot.server";
import { TOKENS } from "./tokens";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tickBot(admin: any, bot: any) {
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
    res = { patch: { last_error: ((e as Error).message ?? "erro").split("\n")[0]!.slice(0, 300) }, order: null };
  }
  if (res.order) {
    await admin.from("orders").insert(res.order);
    const { data: t } = await admin.from("user_tokens").select("symbol").eq("user_id", bot.user_id).ilike("address", bot.token).maybeSingle();
    const ok = res.order.status === "confirmada";
    await admin.from("notifications").insert({
      user_id: bot.user_id,
      title: ok ? `Robô ${res.order.side === "compra" ? "comprou" : "vendeu"} ${TOKENS.find((x) => x.address.toLowerCase() === String(bot.token).toLowerCase())?.symbol ?? t?.symbol ?? "token"}` : `Robô: ${res.order.side} falhou`,
      body: ok ? String(res.patch["last_reason"] ?? "Seguindo sua estratégia.") : String(res.order.error ?? "Nada foi trocado."),
      link: "/grade",
    });
  }
  await admin.from("grid_bots").update({ ...res.patch, last_run_at: new Date().toISOString() }).eq("id", bot.id);
  return { ok: !res.patch["last_error"], action: res.order?.side ?? "nenhuma", status: res.order?.status ?? null, error: (res.patch["last_error"] as string | null) ?? null, reason: (res.patch["last_reason"] as string | null) ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tickAll(admin: any) {
  const { data: bots } = await admin.from("grid_bots").select("*").eq("armed", true).limit(200);
  const out = [];
  for (const b of bots ?? []) out.push(await tickBot(admin, b));
  return out.length;
}
