import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";
export function WalletSelector() {
  const { user } = useAuth();
  const { walletScope, wallets, selectWallet, ready } = useSelectedWallet();
  if (!user) return null;
  return (
    <section className="mb-5 rounded-2xl bg-secondary/50 p-4">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:gap-3">
        <label className="min-w-0 flex-1 text-sm font-medium" htmlFor="active-wallet">
          Carteira selecionada
          <select
            id="active-wallet"
            className="mt-1 block w-full min-w-0 rounded-md border border-border bg-background p-2 text-sm"
            value={walletScope}
            disabled={!ready}
            onChange={(e) => selectWallet(e.target.value)}
          >
            <option value={LEGACY_WALLET_SCOPE}>Robô original</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label || "Carteira"} · {w.address.slice(0, 6)}…{w.address.slice(-4)}
              </option>
            ))}
          </select>
        </label>
        <Link className="py-2 text-xs text-primary underline" to="/carteiras">
          Gerenciar carteiras
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Trocar a carteira exibida não pausa os outros robôs. Cada carteira tem saldo e configuração
        independentes para os robôs.
      </p>
    </section>
  );
}
