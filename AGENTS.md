<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules
- Built-in tokens live in src/lib/tokens.ts; users add more into user_tokens (RLS own), exposed via SelectedTokenProvider.tokens — pages never hardcode the list. Server reads unknown token metadata on-chain via tokenMeta.server.ts.
- Wallet scan checks balances of POPULAR_BSC_TOKENS + saved tokens by multicall — free BSC RPCs/BscScan cannot list all tokens of a wallet.
- Painel, Operar and Grade share selection through SelectedTokenProvider; restore browser storage after hydration so navigation does not silently change the asset.
- Market reads cache and coalesce public requests per token in market.server.ts, falling back to factory/reserves on-chain; unavailable aggregate metrics remain null.
- Chart history reads cache and coalesce in history.server.ts by pool and token; retain the last successful chart on refresh failure and label stale data rather than fabricating prices.
- Automated grid signs with a server-generated bot wallet (AES-GCM with BOT_KEY_SECRET, table bot_wallets readable only by service_role) — users never hand over keys.
- Grid decisions are pure in src/lib/grid.ts (tested); on-chain execution lives in *.server.ts and runs at most one swap per tick.
- The scheduler endpoint /api/public/hooks/grid-tick authenticates with a token stored in internal_tokens (service_role only) so pg_cron and the route share it without exposing it.
- Browser bundle maps Node `events`/`buffer` to npm polyfills via a client-only resolveId plugin in vite.config.ts — WalletConnect crashes (EventEmitter is not a constructor) without them.
- Token buy/sell tax is measured by a simulated buy+sell eth_call with a state-overridden probe contract (taxDetect.server.ts) — no funds move and it works for any token with a V2 BNB pair; manual values in the strategy override it.
