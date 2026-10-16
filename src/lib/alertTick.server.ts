import { readMarket } from "./market.server";
import { alertState, shouldNotify, targetPrice, type AlertState } from "./alerts";
import { pushToUser } from "./pushSend.server";

const fmt = (n: number) => (n < 0.01 ? n.toPrecision(4) : n.toFixed(4)).replace(".", ",");

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
    sent += await pushToUser(db, a.user_id, title, body, "/alertas");
  }
  return { ok: true, checked: alerts.length, sent };
}
