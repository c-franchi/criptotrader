/* eslint-disable @typescript-eslint/no-explicit-any */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "owner" } as any, error: false, rows: [] as any[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/hooks/useSelectedWallet", () => ({
  useSelectedWallet: () => ({ walletScope: "one", name: "Master" }),
}));
vi.mock("@/hooks/currencyContext", () => ({
  useCurrency: () => ({ currency: "BRL", quote: { bnbUsd: 10, usdBrl: 5 } }),
}));
vi.mock("@/lib/fundsOverview.functions", () => ({ getFundsOverview: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { wallets: state.rows, balanceAt: 1000000, blockNumber: "42" },
    isError: state.error,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
import { FundsOverview } from "./FundsOverview";
afterEach(() => {
  cleanup();
  state.user = { id: "owner" };
  state.error = false;
});
const wallet = {
  address: "0xpersonal",
  label: "Pessoal",
  personal: true,
  bot: false,
  scopes: ["one"],
  bnb: "1",
  assets: [],
  issues: [],
  capital: null,
};
it("opens with all wallets and combines robot holdings, then filters to the selected group", () => {
  state.rows = [
    wallet,
    {
      ...wallet,
      address: "0xbot",
      label: "Robôs",
      bot: true,
      bnb: "2",
      assets: [{ address: "t", symbol: "T", amount: "100", priceBnb: "0.002" }],
    },
    { ...wallet, address: "0xother", scopes: ["other"] },
  ];
  render(<FundsOverview />);
  expect(screen.getByText(/210,00/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Master$/ }));
  expect(screen.getByText(/160,00/)).toBeTruthy();
  expect(screen.queryByText(/210,00/)).toBeNull();
});
it("clearly labels incomplete valuations instead of claiming a complete total", () => {
  state.rows = [
    { ...wallet, assets: [{ address: "t", symbol: "T", amount: "100", priceBnb: null }] },
  ];
  render(<FundsOverview />);
  expect(screen.getByText("Consulta parcial · subtotal apurado")).toBeTruthy();
  expect(screen.getByText(/total completo ainda está indisponível/)).toBeTruthy();
});
it("does not display a previous account's balances after logout", () => {
  state.user = null;
  state.rows = [wallet];
  const { container } = render(<FundsOverview />);
  expect(container.textContent).toBe("");
});
it("marks retained values as the last successful query if a refresh fails", () => {
  state.rows = [wallet];
  state.error = true;
  render(<FundsOverview />);
  expect(screen.getByText("Último total consultado")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("última consulta");
});
