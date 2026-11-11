// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("persists limits with owner-only access and database safety bounds in an isolated database", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;`);
    await db.exec(readFileSync("drizzle/migrations/0026_manual_sale_limits.sql", "utf8"));
    await db.exec(`SET test.uid='11111111-1111-4111-8111-111111111111'; SET ROLE authenticated;`);
    const insert = `INSERT INTO public.manual_sale_limits VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','0x1111111111111111111111111111111111111111',0,7)`;
    await db.exec(insert);
    expect((await db.query("SELECT max_price_impact_pct,max_slippage_pct FROM manual_sale_limits")).rows).toEqual([{ max_price_impact_pct: "0", max_slippage_pct: "7" }]);
    await expect(db.exec(`UPDATE manual_sale_limits SET max_price_impact_pct=21`)).rejects.toThrow();
    await db.exec(`SET test.uid='33333333-3333-4333-8333-333333333333'`);
    expect((await db.query("SELECT * FROM manual_sale_limits")).rows).toHaveLength(0);
    await expect(db.exec(insert)).rejects.toThrow();
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(db.query("SELECT * FROM manual_sale_limits")).rejects.toThrow();
  } finally { await db.close(); }
});