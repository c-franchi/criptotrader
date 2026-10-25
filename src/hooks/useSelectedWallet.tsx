import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import { useSavedWallets } from "./useSavedWallets";
import type { FundWallet } from "@/lib/fundsOverview";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";

type Context = {
  walletScope: string;
  name: string;
  address: string | null;
  wallets: ReturnType<typeof useSavedWallets>["wallets"];
  selectWallet: (scope: string) => boolean;
  fundAddress: string | null;
  selectFundWallet: (wallet: FundWallet) => boolean;
  setWalletDirty: (dirty: boolean) => void;
  ready: boolean;
};
const SelectedWalletContext = createContext<Context | null>(null);
export function SelectedWalletProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { wallets, ready: walletsReady } = useSavedWallets();
  const [selection, setSelection] = useState({ userId: "", scope: LEGACY_WALLET_SCOPE });
  const [fundSelection, setFundSelection] = useState({ userId: "", address: "" });
  const [dirty, setWalletDirty] = useState(false);
  const userId = user?.id ?? "";
  useEffect(() => {
    if (loading || !walletsReady) return;
    let scope = LEGACY_WALLET_SCOPE;
    try {
      const saved = userId ? localStorage.getItem(`cryptobot:wallet:${userId}`) : null;
      if (saved && wallets.some((w) => w.id === saved)) scope = saved;
    } catch {
      /* storage disabled */
    }
    let fundAddress = "";
    try {
      fundAddress = userId ? (localStorage.getItem(`cryptobot:funds-wallet:${userId}`) ?? "") : "";
    } catch {
      /* optional storage */
    }
    setFundSelection({ userId, address: fundAddress });
    setSelection((previous) =>
      previous.userId === userId && previous.scope === scope ? previous : { userId, scope },
    );
  }, [userId, loading, walletsReady, wallets]);
  const walletScope = selection.userId === userId ? selection.scope : LEGACY_WALLET_SCOPE;
  const selected = wallets.find((w) => w.id === walletScope);
  const selectWallet = useCallback(
    (scope: string) => {
      if (scope !== LEGACY_WALLET_SCOPE && !wallets.some((w) => w.id === scope)) return false;
      if (scope === walletScope) return true;
      if (dirty && !confirm("Trocar de carteira? Ajustes ainda não salvos serão descartados."))
        return false;
      setFundSelection({ userId, address: "" });
      setWalletDirty(false);
      setSelection({ userId, scope });
      try {
        localStorage.setItem(`cryptobot:wallet:${userId}`, scope);
        localStorage.removeItem(`cryptobot:funds-wallet:${userId}`);
      } catch {
        /* storage disabled */
      }
      return true;
    },
    [dirty, userId, walletScope, wallets],
  );
  const selectFundWallet = useCallback(
    (wallet: FundWallet) => {
      const scope = wallet.scopes.includes(walletScope) ? walletScope : wallet.scopes[0];
      if (!scope || !selectWallet(scope)) return false;
      setFundSelection({ userId, address: wallet.address });
      try {
        localStorage.setItem(`cryptobot:funds-wallet:${userId}`, wallet.address);
      } catch {
        /* optional storage */
      }
      return true;
    },
    [walletScope, selectWallet, userId],
  );
  return (
    <SelectedWalletContext.Provider
      value={{
        walletScope,
        fundAddress: fundSelection.userId === userId ? fundSelection.address || null : null,
        selectFundWallet,
        name:
          selected?.label ||
          (selected
            ? `${selected.address.slice(0, 6)}…${selected.address.slice(-4)}`
            : "Robô original"),
        address: selected?.address ?? null,
        wallets,
        selectWallet,
        setWalletDirty,
        ready: !loading && walletsReady,
      }}
    >
      <Fragment key={`${userId}:${walletScope}`}>{children}</Fragment>
    </SelectedWalletContext.Provider>
  );
}
export function useSelectedWallet() {
  const context = useContext(SelectedWalletContext);
  if (!context) throw new Error("SelectedWalletProvider ausente");
  return context;
}
