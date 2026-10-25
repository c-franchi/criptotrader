import { expect, it } from "vitest";
import { botNoticeLink, botSearch, groupBotNotices } from "./botNotice";
const bot = {
  id: "11111111-1111-4111-8111-111111111111",
  token: "0x" + "1".repeat(40),
  wallet_scope: "22222222-2222-4222-8222-222222222222",
};
it("routes a notice to the precise robot, wallet, token and issue", () => {
  const link = botNoticeLink(bot, "market");
  expect(botSearch(Object.fromEntries(new URLSearchParams(link.split("?")[1])))).toEqual({
    bot: bot.id,
    token: bot.token,
    carteira: bot.wallet_scope,
    problema: "market",
  });
  expect(
    botSearch({ token: "javascript:alert(1)", carteira: "foreign", problema: "start" }),
  ).toEqual({});
});
it("groups alternating market warnings without deleting records or mixing different bots", () => {
  const rows = [
    { id: "1", title: "Robô", body: "0x123: Preço desatualizado", link: "/grade" },
    { id: "2", title: "Robô", body: "0x123: Não há cotação de par BNB", link: "/grade" },
    { id: "3", title: "Robô", body: "0x456: Preço desatualizado", link: "/grade" },
  ];
  expect(groupBotNotices(rows).map((g) => g.ids)).toEqual([["1", "2"], ["3"]]);
  expect(rows).toHaveLength(3);
});

it("keeps trade confirmations and pending transactions separate, including legacy notices", () => {
  const modern = botNoticeLink(bot, "history");
  const rows = [
    { id: "1", title: "Robô comprou T", body: "Seguindo a estratégia", link: modern },
    { id: "2", title: "Robô vendeu T", body: "Seguindo a estratégia", link: modern },
    { id: "3", title: "Robô: confirmação pendente", body: "0x123: pendente", link: "/grade" },
    { id: "4", title: "Robô: confirmação pendente", body: "0x123: pendente", link: "/grade" },
  ];
  expect(groupBotNotices(rows).map((g) => g.ids)).toEqual([["1"], ["2"], ["3"], ["4"]]);
});
