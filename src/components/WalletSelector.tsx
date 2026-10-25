import { useAuth } from "@/hooks/useAuth";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { useWalletFunds } from "@/hooks/useWalletFunds";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";
import { WalletPicker } from "./WalletPicker";
export function WalletSelector() {
  const { user } = useAuth();
  const { walletScope, wallets: saved, selectWallet, ready } = useSelectedWallet();
  const { q, choices, value, chooseId } = useWalletFunds();
  if (!user) return null;
  return (
    <div className="mb-4 min-w-0">
      <WalletPicker
        options={
          q.data
            ? choices
            : [
                { id: LEGACY_WALLET_SCOPE, label: "Carteira original" },
                ...saved.map((w) => ({ id: w.id, label: w.label || "Carteira" })),
              ]
        }
        value={q.data ? value : walletScope}
        disabled={!ready}
        onChange={(id) => (q.data ? chooseId(id) : selectWallet(id))}
      />
    </div>
  );
}
