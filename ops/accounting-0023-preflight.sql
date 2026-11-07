-- READ-ONLY release inspection for CryptoBot migration 0023.
-- No credentials, wallet data, cron commands, DDL or DML in these queries.
SELECT current_database() AS database_name,
       to_regclass('public.orders') IS NOT NULL AS orders_exists,
       to_regclass('public.audit_log') IS NOT NULL AS audit_log_exists,
       to_regclass('public.execution_submissions') IS NOT NULL AS execution_journal_exists,
       to_regclass('public.order_accounting_retry') IS NOT NULL AS retry_queue_exists,
       to_regclass('public.accounting_worker_heartbeat') IS NOT NULL AS heartbeat_exists,
       to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS drizzle_ledger_exists,
       to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS supabase_ledger_exists;

WITH required(table_name, column_name) AS (
  VALUES
    ('orders','id'), ('orders','user_id'), ('orders','source'),
    ('orders','side'), ('orders','status'), ('orders','actual_bnb_received'),
    ('orders','tx_hash'), ('orders','wallet'), ('orders','wallet_scope'),
    ('orders','token'), ('orders','pair_address'), ('orders','amount_in'),
    ('audit_log','action'), ('audit_log','user_id')
)
SELECT r.table_name, r.column_name,
       (c.column_name IS NOT NULL) AS present,
       c.data_type
FROM required r
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=r.table_name
 AND c.column_name=r.column_name
ORDER BY r.table_name, r.column_name;

SELECT to_regprocedure('public.queue_sale_accounting()') IS NOT NULL AS queue_function_exists,
       to_regprocedure('public.claim_order_accounting(integer)') IS NOT NULL AS claim_function_exists,
       to_regprocedure('public.reject_client_financial_proof()') IS NOT NULL AS protection_function_exists;

-- Administrator-only optional read:
-- SELECT jobname, jobid, schedule, active FROM cron.job
-- WHERE jobname IN ('grid-tick','accounting-tick');
-- NEVER select cron.job.command because it can embed authentication secrets.
