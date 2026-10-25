import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarket, type PoolInfo } from "@/lib/chain.functions";
/** Historical display keeps its pool even when the executable live quote is temporarily unavailable. */
export function useChartPool(token: string, livePool: PoolInfo | undefined) {
  const metadata = useQuery({
    queryKey: ["market", token],
    queryFn: () => getMarket({ data: { address: token } }),
    staleTime: 30000,
    refetchInterval: 60000,
    retry: false,
  });
  const [remembered, setRemembered] = useState<{ token: string; pairAddress: string } | null>(null);
  const candidate =
    livePool ?? metadata.data?.pools.find((p) => p.supported) ?? metadata.data?.pools[0];
  useEffect(() => {
    const key = `cryptobot:chart-pool:${token.toLowerCase()}`;
    if (candidate?.pairAddress) {
      setRemembered({ token, pairAddress: candidate.pairAddress });
      try {
        localStorage.setItem(key, candidate.pairAddress);
      } catch {
        /* optional cache */
      }
    } else {
      try {
        const saved = localStorage.getItem(key);
        if (saved && /^0x[0-9a-fA-F]{40}$/.test(saved))
          setRemembered({ token, pairAddress: saved });
      } catch {
        /* optional cache */
      }
    }
  }, [token, candidate?.pairAddress]);
  return (
    candidate?.pairAddress ?? (remembered?.token === token ? remembered.pairAddress : undefined)
  );
}
