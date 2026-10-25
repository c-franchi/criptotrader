const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const addr = /^0x[0-9a-f]{40}$/i;
export type BotProblem = "market" | "execution" | "fund" | "fees" | "rules" | "history";
export function botProblem(message: string): BotProblem {
  if (/concilia|pendente|bloquead|carteira em uso/i.test(message)) return "execution";
  if (/gas|gás|slippage|taxa/i.test(message)) return "fees";
  if (/saldo|insuficiente.*BNB|BNB.*insuficiente/i.test(message)) return "fund";
  if (/preço|cota[çc][aã]o|RPC|mercado|consulta|pool|par BNB/i.test(message)) return "market";
  return "rules";
}
export function botNoticeLink(
  bot: { id: string; token: string; wallet_scope?: string },
  problem: BotProblem,
) {
  return `/grade?${new URLSearchParams({ bot: bot.id, token: bot.token, carteira: bot.wallet_scope ?? "00000000-0000-0000-0000-000000000000", problema: problem })}`;
}
export function botSearch(s: Record<string, unknown>): {
  bot?: string;
  token?: string;
  carteira?: string;
  problema?: BotProblem;
} {
  const problem = s["problema"];
  return {
    ...(typeof s["bot"] === "string" && uuid.test(s["bot"]) ? { bot: s["bot"] } : {}),
    ...(typeof s["token"] === "string" && addr.test(s["token"]) ? { token: s["token"] } : {}),
    ...(typeof s["carteira"] === "string" && uuid.test(s["carteira"])
      ? { carteira: s["carteira"] }
      : {}),
    ...(typeof problem === "string" &&
    ["market", "execution", "fund", "fees", "rules", "history"].includes(problem)
      ? { problema: problem as BotProblem }
      : {}),
  };
}
/** Presentation grouping retains the underlying records; it does not delete financial or security history. */
export function groupBotNotices<
  T extends { id: string; title: string; body: string; link: string | null },
>(rows: T[]) {
  const groups = new Map<string, { notice: T; ids: string[] }>();
  for (const row of rows) {
    const financial =
      /comprou|vendeu|confirmação pendente|compra falhou|venda falhou/i.test(row.title) ||
      new URLSearchParams(row.link?.split("?")[1] ?? "").get("problema") === "history";
    const isBot = !financial && (row.link === "/grade" || row.link?.startsWith("/grade?"));
    const key = isBot
      ? `${row.link === "/grade" ? row.body.split(":")[0] : row.link}:${botProblem(row.body)}`
      : row.id;
    const group = groups.get(key);
    if (group) group.ids.push(row.id);
    else groups.set(key, { notice: row, ids: [row.id] });
  }
  return [...groups.values()];
}
