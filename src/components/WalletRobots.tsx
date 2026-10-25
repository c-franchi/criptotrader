import { useNavigate } from "@tanstack/react-router";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import {
  formatFundAmount,
  fundsTotal,
  fundWalletAssets,
  type FundWallet,
} from "@/lib/fundsOverview";
import { TokenLogo } from "./TokenLogo";
import { Button } from "./ui/button";
export function WalletRobots({
  wallets,
  local,
}: {
  wallets: FundWallet[];
  local: (value: string | null) => string;
}) {
  const navigate = useNavigate();
  const { selectWallet } = useSelectedWallet();
  if (!wallets.length) return null;
  return (
    <details className="my-4 rounded-2xl border border-border p-4">
      <summary className="cursor-pointer font-semibold">Robôs desta carteira</summary>
      <div className="mt-3 space-y-3">
        {wallets.map((w) => {
          const total = fundsTotal([w]);
          return (
            <details key={w.address} className="rounded-xl bg-muted/40 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {w.label}{" "}
                <span className="ml-2 tabular-nums">
                  {local(total.total ?? total.known)}
                  {!total.complete ? " · parcial" : ""}
                </span>
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Ativos na carteira automática · o BNB é compartilhado pelos robôs deste grupo.
              </p>
              <ul className="divide-y divide-border">
                {fundWalletAssets(w).map((a) => (
                  <li key={a.address} className="flex items-center gap-3 py-3">
                    <TokenLogo address={a.address} symbol={a.symbol} logoUrl={a.logoUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{a.name}</p>
                      <p className="break-all text-xs text-muted-foreground">
                        {a.amount == null ? "Indisponível" : formatFundAmount(a.amount, 10)}{" "}
                        {a.symbol}
                      </p>
                    </div>
                    <span className="text-right text-sm tabular-nums">{local(a.value)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {(w.bots ?? []).map((bot) => (
                  <Button
                    key={bot.id}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectWallet(bot.scope))
                        void navigate({
                          to: "/grade",
                          search: { bot: bot.id, token: bot.token, carteira: bot.scope },
                        });
                    }}
                  >
                    Abrir robô {bot.symbol} · {bot.armed ? "ligado" : "pausado"}
                  </Button>
                ))}
                {!w.bots?.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const scope = w.robotScopes?.[0] ?? w.scopes[0];
                      if (scope && selectWallet(scope))
                        void navigate({ to: "/grade", search: { carteira: scope } });
                    }}
                  >
                    Abrir robôs
                  </Button>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}
