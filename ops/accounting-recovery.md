# Confirmed native BNB proceeds

`BSC_RPC_URL` remains the execution provider. `BSC_TRACE_RPC_URL` is an optional,
server-only BSC archive RPC URL for recovering historical sale proceeds. Configure
it through the hosting provider's secure environment settings, never in a VITE
variable or a tracked file. The provider must support `debug_traceTransaction`
with `callTracer` and historical receipts on chain 56.

The authenticated `reconcileOrderAccounting` POST reads only the caller's confirmed
sale. It verifies the transaction sender and successful receipt. The optional
archive is checked against chain 56 and the execution receipt's block hash before
using its trace. Only native transfers into/out of the exact wallet count; router
quotes, WBNB withdrawals, deposits and wallet balance snapshots are not used as
confirmed proceeds. Missing history remains pending, never zero or an estimate.

A successful retry appends evidence to audit_log and fills only the order's missing
actual_bnb_received/accounting_status, with user, wallet scope, hash and status
filters. Existing gas (including approval gas), bot position, orders, execution
locks and trading configuration are preserved. Attempts coalesce per user/order
and are limited to once a minute per running instance. No transactions are signed
or broadcast. The UI retries the latest closed cycle on opening and also offers
“Conferir BNB recebido” in each unaccounted sale and cycle.

Closed-cycle results combine all entries and partial exits until quantity is zero,
subtract recorded gas, and retain pending results when any evidence is missing.
Historical truncation prevents presenting a partial ledger as confirmed profit.
