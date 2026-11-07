-- CryptoBot: read-only inspection before ANY scheduler activation.
-- Run in the *identified* production database SQL console with admin access.
-- Does not read SQL commands/authorization headers or expose private data.
-- No INSERT/UPDATE/DELETE, calls to HTTP endpoints, cron mutations, trades or secrets.

SELECT
  to_regclass('public.market_candle_watch') IS NOT NULL AS candle_watch_installed,
  to_regclass('public.market_candle_heartbeat') IS NOT NULL AS candle_heartbeat_installed,
  to_regclass('public.order_accounting_retry') IS NOT NULL AS accounting_queue_installed,
  to_regclass('public.accounting_worker_heartbeat') IS NOT NULL AS accounting_heartbeat_installed,
  to_regprocedure('public.claim_market_candle_pairs(integer)') IS NOT NULL AS candle_claim_installed,
  to_regprocedure('public.claim_order_accounting(integer)') IS NOT NULL AS accounting_claim_installed,
  to_regprocedure('public.queue_sale_accounting()') IS NOT NULL AS manual_sale_trigger_installed;

-- Do not select cron.job.command: it can contain authentication data.
SELECT jobname, active, schedule, jobid
FROM cron.job
WHERE jobname IN ('grid-tick','alert-tick','market-candle-tick','accounting-tick')
ORDER BY jobname;

-- Heartbeat timestamps are explicitly checked, not inferred from installed tables.
SELECT
  (SELECT max(last_invoked_at) FROM public.market_candle_heartbeat) AS candle_last_invoked_utc,
  (SELECT max(last_success_at) FROM public.market_candle_heartbeat) AS candle_last_success_utc,
  (SELECT max(last_run_at) FROM public.accounting_worker_heartbeat) AS accounting_last_run_utc;

-- Aggregate only: no wallet addresses, tx hashes, secrets or user identifiers.
SELECT source, count(*) AS confirmed_sales_without_proceeds
FROM public.orders
WHERE side = 'venda' AND status = 'confirmada'
  AND actual_bnb_received IS NULL
GROUP BY source ORDER BY source;

SELECT o.source, count(*) AS queued_pending_sales
FROM public.order_accounting_retry q
JOIN public.orders o ON o.id=q.order_id
WHERE q.resolved_at IS NULL
GROUP BY o.source ORDER BY o.source;

-- This report cannot certify wallet-secret recovery or a restorable current backup.
