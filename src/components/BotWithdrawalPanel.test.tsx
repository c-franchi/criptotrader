import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BotWithdrawalPanel } from "./BotWithdrawalPanel";
const mocks = vi.hoisted(() => ({ withdraw: vi.fn(), history: vi.fn(), balances: vi.fn() }));
const scope = "11111111-1111-1111-1111-111111111111",
  from = "0x1111111111111111111111111111111111111111",
  mother = "0x2222222222222222222222222222222222222222",
  other = "0x3333333333333333333333333333333333333333",
  token = "0x4444444444444444444444444444444444444444";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("@/hooks/useSavedWallets", () => ({
  useSavedWallets: () => ({
    wallets: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        label: "Mãe A",
        address: "0x2222222222222222222222222222222222222222",
        created_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        label: "Outra",
        address: "0x3333333333333333333333333333333333333333",
        created_at: "2020-01-01T00:00:00Z",
      },
    ],
  }),
}));
vi.mock("@/lib/bot.functions", () => ({
  getBotWallet: mocks.balances,
  getBotWithdrawals: mocks.history,
  withdrawBot: mocks.withdraw,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(walletScope = scope, source = from) {
  mocks.balances.mockResolvedValue({
    address: from,
    bnb: "0.01",
    tokens: [{ address: token, symbol: "AAA", amount: "12.5" }],
  });
  mocks.withdraw.mockResolvedValue({
    status: "completed",
    hashes: ["hash"],
    message: "Devolução confirmada",
  });
  mocks.history.mockResolvedValue({
    rows: [
      {
        id: "journal",
        symbol: "AAA",
        status: "confirmada",
        amount: "12.5",
        received: "11.5",
        gasBnb: "0.00001",
        from,
        to: mother,
        token,
        hash: "0xabc",
        createdAt: "2026-10-25T00:00:00Z",
      },
    ],
    failures: [],
    hasMore: false,
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BotWithdrawalPanel walletScope={walletScope} walletName="Grupo" sourceAddress={source} />
    </QueryClientProvider>,
  );
}
it("identifies source and fixed mother, sends only the selected token after explicit confirmation", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Devolver ativos à carteira mãe" }));
  await screen.findByText("Mãe A");
  await screen.findByRole("checkbox", { name: /AAA/ });
  expect(screen.getByText(from)).toBeTruthy();
  expect(screen.getByText(mother)).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: /BNB.*enviado por último/ }));
  const send = screen.getByRole("button", { name: "Pausar grupo e devolver seleção" });
  expect(send).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Conferi origem/ }));
  await waitFor(() => expect(send).not.toBeDisabled());
  expect(mocks.withdraw).not.toHaveBeenCalled();
  fireEvent.click(send);
  await waitFor(() =>
    expect(mocks.withdraw).toHaveBeenCalledWith({
      data: { walletScope: scope, from, to: mother, assets: [token], keepBnb: "0.0001" },
    }),
  );
});
it("original wallets require a saved explicit destination, rather than guessing ownership from a token", async () => {
  show("00000000-0000-0000-0000-000000000000");
  fireEvent.click(screen.getByRole("button", { name: "Devolver ativos à carteira mãe" }));
  const picker = await screen.findByRole("combobox", { name: "Carteira pessoal de destino" });
  expect(picker).toHaveValue("");
  fireEvent.change(picker, { target: { value: other } });
  expect(mocks.withdraw).not.toHaveBeenCalled();
});
it("history is accessible without selecting a bot token and includes receipts and BscScan links", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Ver devoluções" }));
  expect(await screen.findByText("AAA · confirmada")).toBeTruthy();
  expect(screen.getByText(/Recebido no destino: 11.5 AAA/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Ver transação na BscScan/ })).toHaveAttribute(
    "href",
    "https://bscscan.com/tx/0xabc",
  );
  expect(mocks.history).toHaveBeenCalledWith({ data: { walletScope: scope, limit: 30 } });
  expect(mocks.withdraw).not.toHaveBeenCalled();
});
it("blocks a stale source address even when the form is otherwise authorized", async () => {
  show(scope, other);
  fireEvent.click(screen.getByRole("button", { name: "Devolver ativos à carteira mãe" }));
  await screen.findByText(/A origem mudou/);
  fireEvent.click(screen.getByRole("checkbox", { name: /Conferi origem/ }));
  expect(screen.getByRole("button", { name: "Pausar grupo e devolver seleção" })).toBeDisabled();
  expect(mocks.withdraw).not.toHaveBeenCalled();
});
