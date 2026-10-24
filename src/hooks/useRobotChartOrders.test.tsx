import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRobotChartOrders } from "./useRobotChartOrders";
const mocks = vi.hoisted(() => ({
  pages: [] as unknown[][],
  calls: [] as { filters: unknown[][]; range: number[] }[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const filters: unknown[][] = [];
      let range: number[] = [];
      const query = {
        select: () => query,
        eq: (...a: unknown[]) => {
          filters.push(a);
          return query;
        },
        ilike: (...a: unknown[]) => {
          filters.push(a);
          return query;
        },
        in: (...a: unknown[]) => {
          filters.push(a);
          return query;
        },
        order: () => query,
        range: (a: number, b: number) => {
          range = [a, b];
          return query;
        },
        abortSignal: async () => {
          mocks.calls.push({ filters, range });
          return { data: mocks.pages[mocks.calls.length - 1] ?? [], error: null };
        },
      };
      return query;
    },
  },
}));
afterEach(() => {
  cleanup();
  mocks.pages = [];
  mocks.calls = [];
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
it("loads every confirmed page scoped to the account, wallet and token independently of the history display limit", async () => {
  mocks.pages = [
    Array.from({ length: 500 }, (_, i) => ({ id: `order-${i}` })),
    [{ id: "old-extra" }],
  ];
  const view = renderHook(() => useRobotChartOrders("owner", "wallet-a", "0xToken"), { wrapper });
  await waitFor(() => expect(view.result.current.data).toHaveLength(501));
  expect(mocks.calls.map((c) => c.range)).toEqual([
    [0, 499],
    [500, 999],
  ]);
  for (const call of mocks.calls) {
    expect(call.filters).toContainEqual(["user_id", "owner"]);
    expect(call.filters).toContainEqual(["wallet_scope", "wallet-a"]);
    expect(call.filters).toContainEqual(["token", "0xToken"]);
    expect(call.filters).toContainEqual(["status", "confirmada"]);
  }
});
it("does not fetch private orders without an authenticated account", () => {
  renderHook(() => useRobotChartOrders(undefined, "wallet-a", "0xToken"), { wrapper });
  expect(mocks.calls).toHaveLength(0);
});
