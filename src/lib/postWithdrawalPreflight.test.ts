import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

it("post-withdrawal preflight remains read-only and never returns encrypted keys", () => {
  const sql = readFileSync("ops/post-withdrawal-preflight.sql", "utf8");
  const executable = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  expect(executable).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\s+/i);
  expect(executable).toContain("FROM public.bot_wallets");
  expect(executable).toContain("FROM public.grid_bots");
  expect(executable).toContain("finished_at IS NULL");
  expect(executable).toContain("SELECT user_id, wallet_scope, address");
  expect(executable).not.toMatch(/SELECT\s+.*enc_key/i);
  expect(executable).not.toContain("BOT_KEY_SECRET");
});
