/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, it } from "vitest";
import { notifyBotProblem } from "./botNotice.server";
it("limits alternating price/RPC errors to one incident and does not notify a stopped bot", async () => {
  const notices: any[] = [];
  const bot = { id: "b", user_id: "owner", token: "0x" + "1".repeat(40), armed: true };
  const admin = {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const q: any = {
        select: () => q,
        eq: (key: string, value: string) => {
          filters[key] = value;
          return q;
        },
        gte: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: bot, error: null }),
        insert: async (row: any) => {
          notices.push(row);
          return { error: null };
        },
        then: (resolve: any) =>
          resolve({
            data:
              table === "notifications"
                ? notices.filter(
                    (n) => n.user_id === filters["user_id"] && n.link === filters["link"],
                  )
                : [],
            error: null,
          }),
      };
      return q;
    },
  };
  await notifyBotProblem(admin, bot, "Preço desatualizado", "Mercado");
  await notifyBotProblem(admin, bot, "Não há cotação de par BNB", "Mercado");
  expect(notices).toHaveLength(1);
  bot.armed = false;
  await notifyBotProblem(admin, bot, "Saldo insuficiente", "Saldo");
  expect(notices).toHaveLength(1);
  expect(notices[0].link).toContain("problema=market");
});
