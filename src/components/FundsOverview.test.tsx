/* eslint-disable @typescript-eslint/no-explicit-any */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "owner" } as any, error: false, rows: [] as any[] }));
vi.mock("@/hooks/useSelectedToken", () => ({
  useSelectedToken: () => ({ tokens: [{ address: "t", name: "Token de teste", symbol: "T" }] }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));
const navigation = vi.hoisted(() => ({ go: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigation.go,
}));
vi.mock("@/hooks/useSelectedWallet", async () => {
  const { useState } = await import("react");
  return {
    useSelectedWallet: () => {
      const [fundAddress, set] = useState(() =>
        localStorage.getItem(`cryptobot:funds-wallet:${state.user?.id}`),
      );
      return {
        walletScope: "one",
        address: "0xpersonal",
        fundAddress,
        selectWallet: () => true,
        selectFundWallet: (w: any) => {
          set(w.address);
          localStorage.setItem(`cryptobot:funds-wallet:${state.user?.id}`, w.address);
          return true;
        },
      };
    },
  };
});
vi.mock("@/hooks/currencyContext", () => ({
  useCurrency: () => ({ currency: "BRL", quote: { bnbUsd: 10, usdBrl: 5 } }),
}));
vi.mock("@/lib/fundsOverview.functions", () => ({ getFundsOverview: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { wallets: state.rows, balanceAt: 1000000 },
    isError: state.error,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
import { FundsOverview } from "./FundsOverview";
afterEach(() => {
  cleanup();
  localStorage.clear();
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
const robot = {
  ...wallet,
  address: "0xrobot",
  label: "Master robô",
  personal: false,
  bot: true,
  bnb: "2",
  assets: [{ address: "t", symbol: "T", amount: "100", priceBnb: "0.002" }],
  bots: [{ id: "bot", token: "t", symbol: "T", scope: "one", armed: false }],
};
function chooseOther() {
  fireEvent.click(screen.getByRole("button", { name: /Escolher carteira:/ }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Reserva/ }));
}
it("keeps robot assets in a nested accordion, outside the personal-wallet selector", () => {
  state.rows = [wallet, robot];
  render(<FundsOverview />);
  expect(screen.getByText(/Total de fundos/).textContent).toContain("160,00");
  const accordion = screen.getByText("Robôs desta carteira").closest("details")!;
  fireEvent.click(screen.getByText("Robôs desta carteira"));
  expect(accordion.compareDocumentPosition(screen.getByText("Endereço e reservas"))).toBe(4);
  expect(within(accordion).getByText("100 T")).toBeTruthy();
  fireEvent.click(within(accordion).getByRole("button", { name: "Abrir robô T · pausado" }));
  expect(navigation.go).toHaveBeenCalledWith({
    to: "/grade",
    search: { bot: "bot", token: "t", carteira: "one" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Escolher carteira:/ }));
  expect(
    within(screen.getByRole("dialog")).queryByRole("button", { name: /Master robô/ }),
  ).toBeNull();
});
it("limits the initial token list to four largest holdings, expands and resets on another wallet", () => {
  state.rows = [
    {
      ...wallet,
      assets: Array.from({ length: 5 }, (_, i) => ({
        address: `asset${i}`,
        name: `Ativo ${i}`,
        symbol: `A${i}`,
        amount: `${i + 1}`,
        priceBnb: "1",
      })),
    },
    { ...wallet, address: "0xother", label: "Reserva", scopes: ["two"] },
  ];
  render(<FundsOverview />);
  const list = screen.getByRole("region", { name: "Tokens de Pessoal" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  expect(within(list).getAllByRole("listitem")[0]?.textContent).toContain("Ativo 4");
  expect(within(list).queryByText("BNB", { selector: "p" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ver todos (6)" }));
  expect(within(list).getAllByRole("listitem")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "Mostrar menos" }));
  expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Ver todos (6)" }));
  chooseOther();
  expect(screen.queryByText("Ativo 4")).toBeNull();
  expect(screen.queryByRole("button", { name: "Mostrar menos" })).toBeNull();
});
it("restores the display selection on remount without changing robot configuration", () => {
  state.rows = [wallet, { ...wallet, address: "0xother", label: "Reserva", scopes: ["two"] }];
  const view = render(<FundsOverview />);
  chooseOther();
  view.unmount();
  render(<FundsOverview />);
  expect(screen.getByRole("button", { name: "Escolher carteira: Reserva" })).toBeTruthy();
});
it("ignores a saved wallet that was removed", () => {
  localStorage.setItem("cryptobot:funds-wallet:owner", "0xremoved");
  state.rows = [wallet];
  render(<FundsOverview />);
  expect(screen.getByRole("button", { name: "Escolher carteira: Pessoal" })).toBeTruthy();
});
it("clearly labels incomplete valuations and retains unpriced token quantities", () => {
  state.rows = [
    { ...wallet, assets: [{ address: "t", symbol: "T", amount: "100", priceBnb: null }] },
  ];
  render(<FundsOverview />);
  expect(screen.getByText("Consulta parcial · subtotal apurado")).toBeTruthy();
  expect(screen.getByText(/total completo ainda está indisponível/)).toBeTruthy();
  const token = screen.getByText("Token de teste").closest("li")!;
  expect(within(token).getByText("100 T")).toBeTruthy();
  expect(within(token).getByText("Não apurado")).toBeTruthy();
});
it("does not display balances after logout or inherit another user's wallet choice", () => {
  localStorage.setItem("cryptobot:funds-wallet:other", robot.address);
  state.rows = [wallet, robot];
  render(<FundsOverview />);
  expect(screen.getByRole("button", { name: "Escolher carteira: Pessoal" })).toBeTruthy();
  cleanup();
  state.user = null;
  const { container } = render(<FundsOverview />);
  expect(container.textContent).toBe("");
});
it("marks retained values as the last successful query if a refresh fails", () => {
  state.rows = [wallet];
  state.error = true;
  render(<FundsOverview />);
  expect(screen.getByText("Último saldo consultado")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("última consulta");
});

it("opens manual trading only from the personal wallet's token row", () => {
  state.rows = [{ ...wallet, assets: robot.assets }, robot];
  render(<FundsOverview />);
  fireEvent.click(screen.getByRole("button", { name: "Operar T da carteira Pessoal" }));
  expect(navigation.go).toHaveBeenCalledWith({ to: "/operar", search: { token: "t" } });
  expect(localStorage.getItem("cryptobot:funds-wallet:owner")).toBe("0xpersonal");
});
it("opens native BNB as the payment asset without pretending it is a WBNB balance", () => {
  state.rows = [wallet];
  render(<FundsOverview />);
  fireEvent.click(screen.getByRole("button", { name: "Operar BNB da carteira Pessoal" }));
  expect(navigation.go).toHaveBeenCalledWith({ to: "/operar", search: { pagamento: "BNB" } });
});
