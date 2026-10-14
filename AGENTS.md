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
- Supported tokens live in src/lib/tokens.ts; pages pick from that list — keeps trading/analysis in sync.
- Automated grid signs with a server-generated bot wallet (AES-GCM with BOT_KEY_SECRET, table bot_wallets readable only by service_role) — users never hand over keys.
- Grid decisions are pure in src/lib/grid.ts (tested); on-chain execution lives in *.server.ts and runs at most one swap per tick.
- The scheduler endpoint /api/public/hooks/grid-tick authenticates with a token stored in internal_tokens (service_role only) so pg_cron and the route share it without exposing it.
