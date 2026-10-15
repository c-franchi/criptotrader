import { Link } from "@tanstack/react-router";
import { useSavedWallets } from "@/hooks/useSavedWallets";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Quick-fill buttons for the user's saved wallets, shown under a wallet field. */
export function WalletPicker({ value, onPick }: { value?: string; onPick: (address: string) => void }) {
  const { wallets } = useSavedWallets();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {wallets.map((w) => {
        const active = value?.toLowerCase() === w.address.toLowerCase();
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => onPick(w.address)}
            className={`rounded-full border px-2.5 py-1 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground"}`}
          >
            {w.label || short(w.address)}
          </button>
        );
      })}
      <Link to="/carteiras" className="text-xs text-primary underline">
        {wallets.length ? "Gerenciar" : "Salvar carteiras"}
      </Link>
    </div>
  );
}
