# CryptoBot: safe release checklist for accounting migration 0023

## What was fixed
The SQL body for `reject_client_financial_proof` mistakenly used `AS $`
and `END $;`; these are now `AS $$` and `END $$;`. Existing migrations
`0015`–`0022` and the migration ledger were **not** edited.

## Gate 1: production and recovery
- Confirm in Lovable Project settings → Git that this workspace points to
  `c-franchi/criptotrader`, branch `main`, at the corrected commit.
- Identify the exact database used by the published CryptoBot app.
- Confirm a valid restore point/backup and note its most recent **UTC timestamp**,
  retention and restore capability. If missing, **STOP**. No new trades,
  changes in bots, or database mutations as part of preflight.
- Keep the existing `grid-tick` cron unchanged.

## Gate 2: inspect historical migration divergence
- Run `ops/accounting-0023-preflight.sql` (read-only).
- Compare the actual database objects against migrations `0015` through
  `0022` and the migration ledger used by this particular deployment.
- Missing history rows do not necessarily mean missing tables/columns.
  The repository itself does not contain snapshots for every numbered
  migration. Do not fabricate snapshots or fill migration records blindly.
- Never apply older migrations wholesale to production simply because their
  history records are missing. Do not use forced push or destructive reset.
- Reconcile the actual schema and ledger separately with a documented,
  approved plan for the **specific** migration tool (Drizzle vs Supabase).
  If this cannot be established, **STOP**.

## Gate 3: install and activate only after approval
- If the schema matches required prerequisites and recovery is confirmed,
  apply the corrected `0023_order_accounting_retry.sql` **once** through
  the project's established migration mechanism.
- Verify the queue, heartbeat, and three functions, without changing
  historic `orders`, `grid_bots` or `execution_submissions`.
- Only after the `accounting-tick` route is published and the migration
  is verified, run `ops/accounting-tick-cron.sql` as a separate change.
  It must not modify or restart `grid-tick`.
- Confirm the heartbeat and number of reconciled and pending GTE sales.
  Do not label pending receipts as profits without transaction evidence.

## Report required from Lovable
Deployment commit; database identity; recoverable backup timestamp UTC;
preflight results; status of missing migration history; application of 0023
(yes/no); new cron active (yes/no); count of GTE sales reconciled vs pending.
If any release gate fails, report "no production mutations performed".
