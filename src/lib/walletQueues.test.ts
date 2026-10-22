import { expect, it } from "vitest";
import { runWalletQueues } from "./walletQueues";
it("a slow wallet does not stop another wallet and never overlaps its own bots", async () => {
  const started: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bots = [
    { user_id: "u", wallet_scope: "a", id: "a1" },
    { user_id: "u", wallet_scope: "a", id: "a2" },
    { user_id: "u", wallet_scope: "b", id: "b1" },
  ];
  const work = runWalletQueues(
    bots,
    async (bot) => {
      started.push(bot.id);
      if (bot.id === "a1") await gate;
      return bot.id;
    },
    () => true,
  );
  expect(started).toEqual(["a1", "b1"]);
  release();
  expect((await work).sort()).toEqual(["a1", "a2", "b1"]);
});
it("respects the scheduler deadline and separates users sharing the legacy scope", async () => {
  let allowed = true;
  const results = await runWalletQueues(
    [{ user_id: "u" }, { user_id: "u" }, { user_id: "v" }],
    async (b) => {
      allowed = false;
      return b.user_id;
    },
    () => allowed,
    1,
  );
  expect(results).toEqual(["u"]);
});
