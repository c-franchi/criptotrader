import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("accounting migration 0023 release safeguards", () => {
  const sql = readFileSync("drizzle/migrations/0023_order_accounting_retry.sql", "utf8");

  it("uses valid paired PL/pgSQL dollar delimiters", () => {
    expect([...sql.matchAll(/\bAS \$\$\s*\n/g)]).toHaveLength(3);
    expect([...sql.matchAll(/\bEND \$\$;/g)]).toHaveLength(3);
    expect(sql).not.toMatch(/\bAS \$(?!\$)/);
    expect(sql).not.toMatch(/\bEND \$(?!\$);/);
  });

  it("uses a scoped privileged trigger without giving clients queue access", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.queue_sale_accounting()");
    expect(sql).toContain("RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$");
    expect(sql).toContain("TG_TABLE_NAME <> 'orders'");
    expect(sql).toContain("REVOKE ALL ON public.order_accounting_retry FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON public.order_accounting_retry TO service_role");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.queue_sale_accounting() FROM PUBLIC,anon,authenticated");
  });

  it("does not install jobs or update trading orders during schema setup", () => {
    expect(sql).toContain("order_accounting_retry");
    expect(sql).toContain("reject_client_financial_proof");
    expect(sql).not.toMatch(/\bcron\.schedule\s*\(/i);
    expect(sql).not.toMatch(/\bUPDATE\s+public\.orders\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\.orders\b/i);
  });
});
