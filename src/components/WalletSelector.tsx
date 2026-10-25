import { useAuth } from "@/hooks/useAuth";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { useWalletFunds } from "@/hooks/useWalletFunds";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";
import { WalletPicker } from "./WalletPicker";
export function WalletSelector() {
  const { user } = useAuth();
  const { walletScope, wallets: saved, selectWallet, ready } = useSelectedWallet();
  const { wallets, wallet, choose } = useWalletFunds();
  if (!user) return null;
  return (
    <div className="mb-4 min-w-0">
      <WalletPicker
        options={
          wallets.length
            ? wallets.map((w) => ({
                id: w.address,
                label: w.label,
                bot: w.bot,
                detail: `${w.bot ? "Robôs" : "Pessoal"} · ${w.address.slice(0, 6)}…${w.address.slice(-4)}`,
              }))
            : [
                { id: LEGACY_WALLET_SCOPE, label: "Robô original", bot: true },
                ...saved.map((w) => ({ id: w.id, label: w.label || "Carteira" })),
              ]
        }
        value={wallet?.address ?? walletScope}
        disabled={!ready}
        onChange={(id) => {
          const found = wallets.find((w) => w.address === id);
          return found ? choose(found) : selectWallet(id);
        }}
      />
    </div>
  );
}
