/* eslint-disable @typescript-eslint/no-explicit-any */
import { botNoticeLink, botProblem } from "./botNotice";
export async function notifyBotProblem(admin: any, bot: any, attention: string, title: string) {
  try {
    const problem = botProblem(attention);
    const link = botNoticeLink(bot, problem);
    // A flapping RPC/quote source is one incident, rather than a new alarm every two seconds.
    const recent = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", bot.user_id)
      .eq("link", link)
      .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString())
      .limit(1);
    if (recent.error || recent.data?.length) return;
    const current = await admin
      .from("grid_bots")
      .select("armed,archived_at")
      .eq("id", bot.id)
      .eq("user_id", bot.user_id)
      .maybeSingle();
    if (current.error || !current.data?.armed || current.data.archived_at) return;
    await admin.from("notifications").insert({
      user_id: bot.user_id,
      title,
      body: `${String(bot.token).slice(0, 10)}…: ${attention}`,
      link,
    });
  } catch {
    /* Notification delivery must not prevent recording execution state. */
  }
}
