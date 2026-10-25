import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "./useAuth";
import { useSelectedWallet } from "./useSelectedWallet";
import { personalFundWallets, relatedRobotWallets, hasOriginalRobots } from "@/lib/walletGroups";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";
import { getFundsOverview } from "@/lib/fundsOverview.functions";
export function useWalletFunds() {
  const { user } = useAuth();
  const { fundAddress, address, walletScope, selectWallet, selectFundWallet } = useSelectedWallet();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ["funds-overview", user?.id],
    enabled: !!user,
    queryFn: () => getFundsOverview(),
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["funds-overview", user?.id] });
    };
    window.addEventListener("wallets-changed", refresh);
    return () => window.removeEventListener("wallets-changed", refresh);
  }, [client, user?.id]);
  const wallets = user ? (q.data?.wallets ?? []) : [];
  const personal = personalFundWallets(wallets);
  const original = hasOriginalRobots(wallets);
  const wallet =
    personal.find((w) => fundAddress && w.address.toLowerCase() === fundAddress.toLowerCase()) ??
    personal.find((w) => address && w.address.toLowerCase() === address.toLowerCase()) ??
    personal.find((w) => w.scopes.includes(walletScope)) ??
    (walletScope === LEGACY_WALLET_SCOPE && original ? undefined : personal[0]);
  const robotWallets = relatedRobotWallets(wallets, wallet?.scopes ?? [walletScope]);
  const choices = [
    ...personal.map((w) => ({
      id: w.address,
      label: w.label,
      detail: `${w.address.slice(0, 6)}…${w.address.slice(-4)}`,
    })),
    ...(original
      ? [{ id: LEGACY_WALLET_SCOPE, label: "Carteira original", detail: "Robôs vinculados" }]
      : []),
  ];
  const value = wallet?.address ?? (original ? LEGACY_WALLET_SCOPE : "");
  const chooseId = (id: string) => {
    const found = personal.find((w) => w.address === id);
    return found
      ? selectFundWallet(found)
      : id === LEGACY_WALLET_SCOPE && original
        ? selectWallet(id)
        : false;
  };
  return { q, wallets, wallet, robotWallets, choices, value, chooseId, choose: selectFundWallet };
}
