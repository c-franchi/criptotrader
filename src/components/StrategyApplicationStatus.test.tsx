import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyApplicationStatus } from "./StrategyApplicationStatus";

const mocks = vi.hoisted(() => ({ execution: vi.fn(), rows: vi.fn(), scope: vi.fn() }));
vi.mock("@/lib/bot.functions", () => ({ getExecutionStatus: mocks.execution }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/grade">{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: mocks.scope }) }) },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(
  locked: boolean,
  tokens: string,
  pending: { tx_hash: string; created_at: string }[] = [],
) {
  mocks.execution.mockResolvedValue({ locked, pending, lockAcquiredAt: null });
  mocks.rows.mockResolvedValue({ data: [{ strat_state: { tokens } }], error: null });
  mocks.scope.mockReturnValue({ ilike: mocks.rows });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StrategyApplicationStatus walletScope="scope-a" token="0x123" />
    </QueryClientProvider>,
  );
}
it("explains a legacy lock without a journal hash and scopes every read", async () => {
  show(true, "0");
  expect(await screen.findByText(/Não há transação no diário/)).toBeTruthy();
  expect(mocks.execution).toHaveBeenCalledWith({ data: { walletScope: "scope-a" } });
  expect(mocks.scope).toHaveBeenCalledWith("wallet_scope", "scope-a");
  expect(mocks.rows).toHaveBeenCalledWith("token", "0x123");
});
it("explains that pausing does not close an open position", async () => {
  show(false, "12.5");
  expect(await screen.findByText(/pausar o robô não encerra essa posição/)).toBeTruthy();
});
it("allows the user to inspect an unresolved transaction", async () => {
  show(true, "0", [{ tx_hash: "0xabc", created_at: "2026-10-22" }]);
  expect(
    (await screen.findByRole("link", { name: /Conferir transação/ })).getAttribute("href"),
  ).toBe("https://bscscan.com/tx/0xabc");
});
it("instructs explicit application after the guards clear", async () => {
  show(false, "0");
  expect(await screen.findByText(/Nenhuma execução pendente ou posição aberta/)).toBeTruthy();
});
