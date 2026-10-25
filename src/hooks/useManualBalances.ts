import { useCallback, useEffect, useRef, useState } from "react";
export type ManualBalance = { bnb: bigint; gte: bigint };
/** A saved wallet can be read before connecting; late responses never cross wallet/token boundaries. */
export function useManualBalances(
  address: string | null,
  token: string,
  read: (address: string, token: string) => Promise<ManualBalance>,
) {
  const key = `${address?.toLowerCase() ?? ""}:${token.toLowerCase()}`;
  const current = useRef(key);
  current.current = key;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    value: ManualBalance | null;
    error: boolean;
  } | null>(null);
  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const value = await read(address, token);
      if (current.current === key) setSnapshot({ key, value, error: false });
    } catch {
      if (current.current === key) setSnapshot({ key, value: null, error: true });
    }
  }, [address, token, read, key]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  return {
    balance: snapshot?.key === key ? snapshot.value : null,
    error: snapshot?.key === key && snapshot.error,
    refresh,
  };
}
