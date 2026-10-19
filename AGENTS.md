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
- Candidate rules and normalized financial replay live in candidateStrategy.ts/costLedger.ts and are simulation-only; execution must never import them, preserving active cycle behavior.
- Shared OHLC charts aggregate five-minute pool history in candleSeries.ts; legacy SMA remains explicitly identified while candidate signals require contiguous complete closes.
- All bot signing paths acquire the persistent wallet-wide execution mutex; unresolved submissions retain it until reconciliation to prevent duplicate orders and withdrawals racing swaps.
- Audit observations are append-only and distinguish receipt token transfers/gas from native proceeds requiring traces; never label router outputs or legacy quote accounting as confirmed wallet results.
- Strategy stop mode is optional for backward compatibility; use the shared stopLoss helpers for robot, chart and monitoring, avoiding double-counted buy tax in simulations that track net token cost.
- Built-in tokens live in src/lib/tokens.ts; users add more into user_tokens (RLS own), exposed via SelectedTokenProvider.tokens — pages never hardcode the list. Server reads unknown token metadata on-chain via tokenMeta.server.ts.
- Wallet scan checks balances of POPULAR_BSC_TOKENS + saved tokens by multicall — free BSC RPCs/BscScan cannot list all tokens of a wallet.
- Painel, Operar and Grade share selection through SelectedTokenProvider; restore browser storage after hydration so navigation does not silently change the asset.
- Market reads cache and coalesce public requests per token in market.server.ts, falling back to factory/reserves on-chain; unavailable aggregate metrics remain null.
- Chart history reads cache and coalesce in history.server.ts by pool and token, persist the last good list in price_candles (service_role only) and on the device (useCandles); on source failure serve the saved list and label its age instead of fabricating prices.
- Automated grid signs with a server-generated bot wallet (AES-GCM with BOT_KEY_SECRET, table bot_wallets readable only by service_role) — users never hand over keys.
- Robot decisions are pure and tested (src/lib/autoStrategy.ts follows the saved strategy per token; src/lib/grid.ts for price-grid mode); on-chain execution lives in *.server.ts, discounts token tax in min-out, and runs at most one swap per tick.
- /api/public/hooks/grid-tick runs every minute via managed schedule and accepts the managed cron secret or the internal_tokens grid_tick token.
- Browser bundle maps Node `events`/`buffer` to npm polyfills via a client-only resolveId plugin in vite.config.ts — WalletConnect crashes (EventEmitter is not a constructor) without them.
- Token buy/sell tax is measured by a simulated buy+sell eth_call with a state-overridden probe contract (taxDetect.server.ts) — no funds move and it works for any token with a V2 BNB pair; manual values in the strategy override it.
- Bot withdrawals only go to a user_wallets address saved >=24h ago — limits damage from a stolen session.
- Price alerts: pure rules in src/lib/alerts.ts (tested); /api/public/hooks/alert-tick runs every minute via managed schedule, sends FCM through the connector gateway, and dedupes by last_state so repeat calls are harmless.

- In-app notifications live in the notifications table (users read/delete own; only service_role inserts) — alert and robot ticks write them alongside push.

- On-chain market fallback converts to USD through the PancakeSwap V2 WBNB/USDT pool so the robot keeps a USD price when DexScreener is rate-limited.- Security guards (robot liquidity floor, slippage levels, contract bytecode risk scan) are pure helpers in src/lib/safety.ts (tested); wallet-saved alerts go through security.functions.ts so bell+push fire server-side.
