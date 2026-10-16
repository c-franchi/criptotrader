const GATEWAY = "https://connector-gateway.lovable.dev/firebase_messaging";

async function sendPush(token: string, title: string, body: string, link: string): Promise<"ok" | "stale" | "fail"> {
  const lk = process.env["LOVABLE_API_KEY"];
  const ck = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!lk || !ck) return "fail";
  const res = await fetch(`${GATEWAY}/v1/projects/_/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { token, notification: { title, body }, webpush: { fcm_options: { link }, notification: { icon: "/icon-192.png" } } },
    }),
  });
  if (res.ok) return "ok";
  const t = await res.text();
  console.error(`FCM send failed [${res.status}]: ${t}`);
  return res.status === 404 || (res.status === 400 && t.includes("INVALID_ARGUMENT")) ? "stale" : "fail";
}

/** Sends to every device of the user; removes stale tokens. Never throws. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pushToUser(db: any, userId: string, title: string, body: string, link: string): Promise<number> {
  let sent = 0;
  try {
    const { data: devices } = await db.from("push_devices").select("id, token").eq("user_id", userId);
    for (const d of devices ?? []) {
      const r = await sendPush(d.token, title, body, link);
      if (r === "ok") sent++;
      if (r === "stale") await db.from("push_devices").delete().eq("id", d.id);
    }
  } catch (e) { console.error("push error", e); }
  return sent;
}
