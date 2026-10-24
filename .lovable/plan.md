# Sale trace verification: blocked by missing trace RPC

## Findings (read-only)
- `BSC_TRACE_RPC_URL` is **not configured**. It is not in the project secrets or in the sandbox environment.
- No authorized trace-capable RPC is configured on the backend. I tried `debug_traceTransaction` with `callTracer` on public BSC endpoints:
  - bnbchain dataseed: error -32000 "missing trie node". This node prunes history and has no archive state.
  - publicnode: error -32601. The method is not available.
- Native BNB proceeds for sale `0x4cbd9eb3…0d623` (wallet `0x667bB2fC…BFA34`): **UNCONFIRMED**. No complete trace exists, and nothing was inferred from WBNB withdrawals, quotes, pool events or balances.

## Next step (user action)
1. Add `BSC_TRACE_RPC_URL` in Project Settings → Secrets. It must point to an archive node that supports `debug_traceTransaction`, for example a paid QuickNode, Chainstack or NodeReal BSC endpoint.
2. Then re-run this read-only trace with no source changes.

Nothing was changed: no source, database, bot, lock, integration or publish changes.
