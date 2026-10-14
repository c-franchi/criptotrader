import { runGridStep } from "./bot.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tickBot(admin: any, bot: any) {
  const { data: bw } = await admin.from("bot_wallets").select("enc_key").eq("user_id", bot.user_id).maybeSingle();
  if (!bw) {
    await admin.from("grid_bots").update({ last_error: "Sem carteira do robô", last_run_at: new Date().toISOString() }).eq("id", bot.id);
    return { ok: false, action: "nenhuma" };
  }
  let res;
  try {
    res = await runGridStep(bot, bw.enc_key);
  } catch (e) {
    res = { patch: { last_error: ((e as Error).message ?? "erro").split("\n")[0]!.slice(0, 300) }, order: null };
  }
  if (res.order) await admin.from("orders").insert(res.order);
  await admin.from("grid_bots").update({ ...res.patch, last_run_at: new Date().toISOString() }).eq("id", bot.id);
  return { ok: !res.patch.last_error, action: res.order?.side ?? "nenhuma", status: res.order?.status ?? null, error: (res.patch.last_error as string | null) ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tickAll(admin: any) {
  const { data: bots } = await admin.from("grid_bots").select("*").eq("armed", true).limit(20);
  const out = [];
  for (const b of bots ?? []) out.push(await tickBot(admin, b));
  return out.length;
}
