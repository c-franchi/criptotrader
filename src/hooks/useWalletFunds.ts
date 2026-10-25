import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "./useAuth";
import { useSelectedWallet } from "./useSelectedWallet";
import { getFundsOverview } from "@/lib/fundsOverview.functions";
export function useWalletFunds() {
  const { user } = useAuth();
  const { fundAddress, address, walletScope, selectFundWallet } = useSelectedWallet();
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
  const wallet =
    wallets.find((w) => fundAddress && w.address.toLowerCase() === fundAddress.toLowerCase()) ??
    wallets.find((w) => address && w.address.toLowerCase() === address.toLowerCase()) ??
    wallets.find((w) => w.scopes.includes(walletScope)) ??
    wallets[0];
  return { q, wallets, wallet, choose: selectFundWallet };
}
