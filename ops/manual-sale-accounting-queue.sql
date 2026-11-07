-- CryptoBot: standalone, additive patch for manual GTE/other sales.
-- Run ONLY once release gates (recoverable backup, wallet secrets, review) pass.
-- This is NOT a Drizzle migration. Never replay historical migrations 0015-0024.
-- The script never updates orders, bot state, wallets, strategies or trades.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.order_accounting_retry') IS NULL
     OR to_regprocedure('public.queue_sale_accounting()') IS NULL
     OR to_regprocedure('public.claim_order_accounting(integer)') IS NULL THEN
    RAISE EXCEPTION 'Missing accounting migration 0023 objects: abort without changes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'orders'
      AND t.tgname = 'queue_sale_accounting' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Missing orders accounting trigger: abort without changes';
  END IF;
  IF has_table_privilege('authenticated','public.order_accounting_retry','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('anon','public.order_accounting_retry','SELECT,INSERT,UPDATE,DELETE')
     OR has_function_privilege('authenticated','public.claim_order_accounting(integer)','EXECUTE')
     OR has_function_privilege('anon','public.claim_order_accounting(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Accounting queue privileges are unsafe: abort without changes';
  END IF;
END
$preflight$;

-- Maintain the existing privileged, narrow queue writer and its restricted
-- search path. The trigger is already installed on orders by migration 0023.
-- A confirmed manual sale is eligible only if it still lacks native proceeds.
CREATE OR REPLACE FUNCTION public.queue_sale_accounting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'orders' THEN
    RAISE EXCEPTION 'Accounting trigger invoked outside orders';
  END IF;
  IF NEW.side = 'venda' AND NEW.status = 'confirmada'
     AND NEW.actual_bnb_received IS NULL THEN
    INSERT INTO public.order_accounting_retry (order_id, user_id)
      VALUES (NEW.id, NEW.user_id)
      ON CONFLICT (order_id) DO NOTHING;
  ELSIF NEW.side = 'venda' AND NEW.status = 'confirmada'
        AND NEW.actual_bnb_received IS NOT NULL THEN
    UPDATE public.order_accounting_retry SET resolved_at = now()
      WHERE order_id = NEW.id AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_sale_accounting() FROM PUBLIC, anon, authenticated;

-- Only backfill confirmed historical manual sales with a transaction hash.
-- Preserve existing retry attempts/leases and never set actual_bnb_received.
INSERT INTO public.order_accounting_retry (order_id, user_id)
SELECT o.id, o.user_id
FROM public.orders AS o
WHERE o.source = 'manual'
  AND o.side = 'venda'
  AND o.status = 'confirmada'
  AND o.actual_bnb_received IS NULL
  AND o.tx_hash IS NOT NULL
ON CONFLICT (order_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Read-only verification; aggregate totals only, no secrets or hashes.
SELECT o.source, count(*) AS sales_pending
FROM public.order_accounting_retry j
JOIN public.orders o ON o.id = j.order_id
WHERE j.resolved_at IS NULL AND o.status = 'confirmada'
GROUP BY o.source ORDER BY o.source;
