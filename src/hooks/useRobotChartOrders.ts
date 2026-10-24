import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** Chart evidence is independent of the history tab's display limit. */
export function useRobotChartOrders(
  userId: string | undefined,
  walletScope: string,
  token: string,
) {
  return useQuery({
    queryKey: ["robot-chart-orders", userId, walletScope, token.toLowerCase()],
    enabled: !!userId,
    queryFn: async ({ signal }) => {
      if (!userId) return [];
      const rows: Tables<"orders">[] = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("user_id", userId)
          .eq("wallet_scope", walletScope)
          .ilike("token", token)
          .in("source", ["grade", "robo"])
          .eq("status", "confirmada")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1)
          .abortSignal(signal);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }
      return [...new Map(rows.map((row) => [row.id, row])).values()];
    },
    staleTime: 10000,
    refetchInterval: 15000,
    retry: 1,
  });
}
