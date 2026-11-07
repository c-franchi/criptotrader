import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("ops/manual-sale-accounting-queue.sql", "utf8");

describe("standalone manual-sale accounting queue patch", () => {
  it("fails closed unless the existing 0023 queue and trigger are installed", () => {
    expect(sql).toContain("to_regclass('public.order_accounting_retry')");
    expect(sql).toContain("to_regprocedure('public.queue_sale_accounting()')");
    expect(sql).toContain("to_regprocedure('public.claim_order_accounting(integer)')");
    expect(sql).toContain("t.tgname = 'queue_sale_accounting'");
    expect(sql).toContain("RAISE EXCEPTION 'Accounting queue privileges are unsafe");
  });

  it("preserves privileged-only queue access and protects the function search path", () => {
    expect(sql).toContain(
      "RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$",
    );
    expect(sql).toContain("TG_TABLE_SCHEMA <> 'public'");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.queue_sale_accounting() FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain("ON CONFLICT (order_id) DO NOTHING");
  });

  it("allows previously excluded manual sales and leaves robot sales eligible", () => {
    expect(sql).toMatch(/IF NEW\.side = 'venda' AND NEW\.status = 'confirmada'/);
    expect(sql).toMatch(/NEW\.actual_bnb_received IS NULL/);
    expect(sql).toContain("WHERE o.source = 'manual'");
    expect(sql).toContain("AND o.tx_hash IS NOT NULL");
    expect(sql).not.toMatch(/NEW\.source\s*<>\s*'manual'/);
    expect(sql).toContain("AND resolved_at IS NULL");
  });

  it("does not execute cron, rewrite orders, trade, reset wallets or replay migration history", () => {
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE)\s+public\.orders\b/i);
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE)\s+public\.(?:grid_bots|bot_wallets|strategies|execution_submissions)\b/i);
    expect(sql).not.toMatch(/\b(?:cron\.schedule|drizzle\.__drizzle_migrations)\b/i);
    expect(sql).not.toMatch(/\b(?:actual_bnb_received\s*=|accounting_status\s*=)\s*'confirmado'/i);
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });
});
