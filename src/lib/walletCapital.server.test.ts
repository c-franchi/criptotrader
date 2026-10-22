import { expect, it, vi } from "vitest";
import { readWalletCapital } from "./walletCapital.server";
it("qualifies both capital queries by user and wallet, returning no signing material", async () => {
  const queries: { table: string; filters: [string, string][]; fields: string }[] = [];
  const admin = {
    from: (table: string) => {
      const entry = { table, filters: [] as [string, string][], fields: "" };
      queries.push(entry);
      const query = {
        is: () => query,
        select: (fields: string) => {
          entry.fields = fields;
          return query;
        },
        eq: (key: string, value: string) => {
          entry.filters.push([key, value]);
          return query;
        },
        then: (resolve: (result: unknown) => void) => resolve({ data: [], error: null }),
      };
      return query;
    },
  };
  await readWalletCapital(
    admin as unknown as Parameters<typeof readWalletCapital>[0],
    "owner",
    "scope-a",
    "0.1",
  );
  expect(queries).toHaveLength(2);
  for (const q of queries) {
    expect(q.filters).toEqual([
      ["user_id", "owner"],
      ["wallet_scope", "scope-a"],
    ]);
    expect(q.fields).not.toMatch(/enc_key|secret|private/i);
  }
});
