import { readMarket } from "./market.server";
import { alertState, shouldNotify, targetPrice, type AlertState } from "./alerts";
import { pushToUser } from "./pushSend.server";

const fmt = (n: number) => (n < 0.01 ? n.toPrecision(4) : n.toFixed(4)).replace(".", ",");

export async function runAlertTick() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const checkedAt = new Date().toISOString();
  const since = new Date(Date.now() - 40_000).toISOString();
  const { data: alerts } = await db
    .from("price_alerts")
    .select("*")
    .eq("enabled", true)
    .or(`last_checked_at.is.null,last_checked_at.lt.${since}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(50);

  const rpc = process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org";
  const prices = new Map<string, number | null>();
  for (const a of alerts ?? []) {
    const k = a.token_address.toLowerCase();
    if (prices.has(k)) continue;
    try {
      const m = await readMarket(a.token_address, rpc);
      const p = Number(m.error ? null : m.pools.find((x) => x.supported && x.priceUsd)?.priceUsd);
      prices.set(k, Number.isFinite(p) && p > 0 ? p : null);
    } catch {
      prices.set(k, null);
    }
  }
  let sent = 0;
  for (const a of alerts ?? []) {
    const price = prices.get(a.token_address.toLowerCase());
    if (price == null) continue; // unavailable ≠ zero: keep previous state
    const rule = {
      direction: a.direction as "queda" | "alta",
      basePrice: Number(a.base_price),
      targetPct: Number(a.target_pct),
      warnBeforePct: Number(a.warn_before_pct),
    };
    const next = alertState(rule, price);
    const prev = a.last_state as AlertState;
    const notify = shouldNotify(prev, next);
    const acao = rule.direction === "queda" ? "compra" : "venda";
    const title =
      next === "atingiu"
        ? `${a.symbol}: chegou no ponto de ${acao}!`
        : `${a.symbol}: chegando perto do ponto de ${acao}`;
    const body = `Preço agora: US$ ${fmt(price)}. Seu ponto: US$ ${fmt(targetPrice(rule))} (${rule.direction === "queda" ? "queda" : "alta"} de ${rule.targetPct}%).`;
    const { error } = await db.rpc("record_alert_transition", {
      p_id: a.id,
      p_previous: prev,
      p_next: next,
      p_price: price,
      p_checked: checkedAt,
      // SQL function accepts NULL (no notification); generated types omit nullability.
      p_title: (notify ? title : null) as string,
      p_body: (notify ? body : null) as string,
    });
    if (error) console.error("Alert transition not saved", error.code);
  }
  // Durable outbox: notifications survive temporary gateway failures. Claims prevent concurrent sends.
  const { data: pending } = await db
    .from("notifications")
    .select("id,user_id,title,body,link,push_attempts,push_claimed_at")
    .is("push_sent_at", null)
    .lt("push_attempts", 5)
    .order("created_at")
    .limit(50);
  for (const n of pending ?? []) {
    if (n.push_claimed_at && Date.now() - new Date(n.push_claimed_at).getTime() < 300000) continue;
    const { data: claimed, error } = await db
      .from("notifications")
      .update({ push_claimed_at: new Date().toISOString(), push_attempts: n.push_attempts + 1 })
      .eq("id", n.id)
      .eq("push_attempts", n.push_attempts)
      .is("push_sent_at", null)
      .select("id");
    if (error || !claimed?.length) continue;
    const delivered = await pushToUser(db, n.user_id, n.title, n.body, n.link ?? "/alertas", n.id);
    if (delivered > 0) {
      await db
        .from("notifications")
        .update({ push_sent_at: new Date().toISOString() })
        .eq("id", n.id);
      sent += delivered;
    }
  }
  return { ok: true, checked: alerts?.length ?? 0, sent };
}
