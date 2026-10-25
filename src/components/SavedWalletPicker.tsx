import { useSavedWallets } from "@/hooks/useSavedWallets";
import { WalletPicker } from "./WalletPicker";
/** Address field helper; uses the same selector without changing the active trading wallet. */
export function SavedWalletPicker({
  value,
  onPick,
}: {
  value?: string;
  onPick: (address: string) => void;
}) {
  const { wallets } = useSavedWallets();
  return (
    <div className="mt-2">
      <WalletPicker
        options={wallets.map((w) => ({
          id: w.address,
          label: w.label || "Carteira",
          detail: `${w.address.slice(0, 6)}…${w.address.slice(-4)}`,
        }))}
        value={value ?? ""}
        onChange={onPick}
      />
    </div>
  );
}
