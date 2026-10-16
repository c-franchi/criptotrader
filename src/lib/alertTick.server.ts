import { readMarket } from "./market.server";
import { alertState, shouldNotify, targetPrice, type AlertState } from "./alerts";

const GATEWAY = "https://connector-gateway.lovable.dev/firebase_messaging";
const fmt = (n: number) => (n < 0.01 ? n.toPrecision(4) : n.toFixed(4)).replace(".", ",");

async function sendPush(token: string, title: string, body: string): Promise<"ok" | "stale" | "fail"> {
  const lk = process.env["LOVABLE_API_KEY"];
  const ck = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!lk || !ck) return "fail";
  const res = await fetch(`${GATEWAY}/v1/projects/_/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        webpush: { fcm_options: { link: "/alertas" }, notification: { icon: "/icon-192.png" } },
      },
    }),
  });
  if (res.ok) return "ok";
  const t = await res.text();
  console.error(`FCM send failed [${res.status}]: ${t}`);
  return res.status === 404 || (res.status === 400 && t.includes("INVALID_ARGUMENT")) ? "stale" : "fail";
}

export async function runAlertTick() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 40_000).toISOString();
  const { data: alerts } = await db.from("price_alerts").select("*").eq("enabled", true)
    .or(`last_checked_at.is.null,last_checked_at.lt.${since}`).limit(200);
  if (!alerts?.length) return { ok: true, checked: 0, sent: 0 };
  const rpc = process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org";
  const prices = new Map<string, number | null>();
  for (const a of alerts) {
    const k = a.token_address.toLowerCase();
    if (prices.has(k)) continue;
    try {
      const m = await readMarket(a.token_address, rpc);
      const p = Number(m.pools.find((x) => x.priceUsd)?.priceUsd);
      prices.set(k, Number.isFinite(p) && p > 0 ? p : null);
    } catch { prices.set(k, null); }
  }
  let sent = 0;
  for (const a of alerts) {
    const price = prices.get(a.token_address.toLowerCase());
    if (price == null) continue; // unavailable ≠ zero: keep previous state
    const rule = { direction: a.direction as "queda" | "alta", basePrice: Number(a.base_price), targetPct: Number(a.target_pct), warnBeforePct: Number(a.warn_before_pct) };
    const next = alertState(rule, price);
    const prev = a.last_state as AlertState;
    await db.from("price_alerts").update({ last_state: next, last_price: price, last_checked_at: new Date().toISOString() }).eq("id", a.id);
    if (!shouldNotify(prev, next)) continue;
    const acao = rule.direction === "queda" ? "compra" : "venda";
    const title = next === "atingiu" ? `${a.symbol}: chegou no ponto de ${acao}!` : `${a.symbol}: chegando perto do ponto de ${acao}`;
    const body = `Preço agora: US$ ${fmt(price)}. Seu ponto: US$ ${fmt(targetPrice(rule))} (${rule.direction === "queda" ? "queda" : "alta"} de ${rule.targetPct}%).`;
    await db.from("notifications").insert({ user_id: a.user_id, title, body, link: "/estrategia" });
    const { data: devices } = await db.from("push_devices").select("id, token").eq("user_id", a.user_id);
    for (const d of devices ?? []) {
      const r = await sendPush(d.token, title, body);
      if (r === "ok") sent++;
      if (r === "stale") await db.from("push_devices").delete().eq("id", d.id);
    }
  }
  return { ok: true, checked: alerts.length, sent };
}
