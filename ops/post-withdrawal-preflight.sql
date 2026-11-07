-- CryptoBot: READ-ONLY preflight after user-reported withdrawals (2026-11-07).
-- No private keys, enc_key values, BOT_KEY_SECRET, cron commands or wallet signers.
-- This query CANNOT confirm BNB/token balances on-chain. Check all three addresses separately.

-- Expected baseline from prior audit: 3 encrypted wallets and 8 bots.
SELECT
  (SELECT count(*) FROM public.bot_wallets) AS wallet_count,
  (SELECT count(*) FROM public.bot_wallets
    WHERE address IS NULL OR btrim(address) = ''
       OR enc_key IS NULL OR btrim(enc_key) = '') AS invalid_wallet_records,
  (SELECT count(*) FROM public.grid_bots) AS bot_count,
  (SELECT count(*) FROM public.grid_bots WHERE armed IS TRUE) AS armed_bot_count,
  (SELECT count(*) FROM public.execution_submissions
    WHERE finished_at IS NULL) AS unfinished_submission_count,
  (SELECT count(*) FROM public.bot_execution_locks) AS active_lock_count;

-- Positions remembered by the app are NOT proof of on-chain balances.
-- A positive position after a withdrawal is a reconciliation task, not grounds for a reset.
SELECT
  count(*) FILTER (WHERE archived_at IS NULL) AS non_archived_bots,
  count(*) FILTER (WHERE archived_at IS NOT NULL) AS archived_bots,
  sum(CASE
    WHEN jsonb_typeof(strat_state->'tokens') = 'number' THEN
      CASE WHEN (strat_state->>'tokens')::numeric > 0 THEN 1 ELSE 0 END
    ELSE 0
  END) AS bots_with_recorded_tokens
FROM public.grid_bots;

-- Reveal only public addresses to compare BSC balances and confirmed withdrawal hashes.
SELECT user_id, wallet_scope, address
FROM public.bot_wallets
ORDER BY user_id, wallet_scope, address;

-- Inspect unresolved orders without disclosing wallet secrets or order details.
SELECT status, side, count(*) AS quantity
FROM public.orders
GROUP BY status, side
ORDER BY status, side;

-- Check whether the new accounting and candle structures are still absent.
SELECT
  to_regclass('public.market_candle_bars') IS NOT NULL AS candle_bars_exists,
  to_regclass('public.market_candle_watch') IS NOT NULL AS candle_watch_exists,
  to_regclass('public.market_candle_heartbeat') IS NOT NULL AS candle_heartbeat_exists,
  to_regclass('public.order_accounting_retry') IS NOT NULL AS accounting_queue_exists,
  to_regclass('public.accounting_worker_heartbeat') IS NOT NULL AS accounting_heartbeat_exists,
  to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS drizzle_ledger_exists;

-- If the ledger exists, read its last timestamp separately.
-- Do NOT repair ledger rows or run drizzle-kit migrate as part of preflight.
-- SELECT count(*) AS history_count, max(created_at) AS newest_migration
-- FROM drizzle.__drizzle_migrations;
