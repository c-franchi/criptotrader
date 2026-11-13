import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({
  balance: 20000000000000000n,
  gas: 21000n,
  gasPrice: 100000000n,
  account: "0x1111111111111111111111111111111111111111",
  chain: "0x38",
  request: vi.fn(),
  listeners: new Map<string, () => void>(),
}));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => ({
    getBalance: async () => network.balance,
    getGasPrice: async () => network.gasPrice,
    estimateGas: async () => network.gas,
  }),
}));
vi.mock("@/lib/fx.functions", () => ({ getFxQuote: async () => ({ bnbUsd: 720, usdBrl: 5.1 }) }));
vi.mock("@/lib/walletConnect", () => ({
  connectWallet: async () => ({
    accounts: [network.account],
    request: network.request,
    on: (name: string, callback: () => void) => network.listeners.set(name, callback),
    removeListener: (name: string) => network.listeners.delete(name),
  }),
  resetWallet: async () => {},
  isUnknownMethod: () => false,
}));
vi.mock("@/hooks/useSelectedToken", () => ({ useSelectedToken: () => ({ tokens: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    hash,
    children,
    ...props
  }: {
    to: string;
    hash?: string;
    children: React.ReactNode;
  }) => (
    <a href={to + (hash ? `#${hash}` : "")} {...props}>
      {children}
    </a>
  ),
}));
import { FundBotDialog } from "./FundBotDialog";
beforeEach(() => {
  network.account = "0x1111111111111111111111111111111111111111";
  network.chain = "0x38";
  network.listeners.clear();
  network.request.mockReset().mockImplementation(async ({ method }: { method: string }) => {
    if (method === "eth_accounts") return [network.account];
    if (method === "eth_chainId") return network.chain;
    throw new Error("Signing forbidden in this test");
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([20, 0.01])(
  "permits an R$%s partial deposit and shows the estimated fee and reserve link",
  async (amount) => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FundBotDialog
          botAddress="0x2222222222222222222222222222222222222222"
          botBnb={0}
          need={{ reserve: 0.005, trade: 0.001, total: 0.006 }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar da minha carteira" }));
    fireEvent.click(screen.getByRole("button", { name: "Conectar carteira" }));
    await waitFor(() => expect(screen.getByPlaceholderText("100,00")).not.toBeDisabled());
    await screen.findByText(/Taxa estimada do envio:/, {}, { timeout: 5000 });
    fireEvent.change(screen.getByPlaceholderText("100,00"), { target: { value: String(amount) } });
    await waitFor(
      () => expect(screen.getByRole("button", { name: /Enviar .*BNB.*para o robô/ })).toBeEnabled(),
      { timeout: 5000 },
    );
    expect(screen.getByText(/Depósito parcial/)).toBeTruthy();
    expect(screen.getByText(/Taxa estimada do envio:/).textContent).toContain("0,00000252 BNB");
    expect(screen.getByRole("link", { name: "Ajustar reserva de gás" })).toHaveAttribute(
      "href",
      "/estrategia#strategy-gas",
    );
    // Only read-only RPC mocks ran. The test never clicks Send or requests a signature.
  },
);

it("explains the actual wrong account and blocks sending without requesting a signature", async () => {
  const expected = "0x3333333333333333333333333333333333333333";
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FundBotDialog
        botAddress="0x2222222222222222222222222222222222222222"
        sourceAddress={expected}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Enviar da minha carteira" }));
  fireEvent.click(screen.getByRole("button", { name: "Conectar carteira" }));
  expect(await screen.findByText(/Você está conectado a outra carteira/)).toBeVisible();
  expect(screen.getByText(/Carteira necessária \(origem\)/)).toHaveTextContent("0x3333…3333");
  fireEvent.change(screen.getByPlaceholderText("100,00"), { target: { value: "1" } });
  expect(screen.getByRole("button", { name: "Enviar para o robô" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reconectar carteira" })).toBeEnabled();
  expect(
    network.request.mock.calls.every(([c]) => ["eth_accounts", "eth_chainId"].includes(c.method)),
  ).toBe(true);
});

it("clears the amount and blocks sending when the provider changes networks after connecting", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FundBotDialog
        botAddress="0x2222222222222222222222222222222222222222"
        sourceAddress={network.account}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Enviar da minha carteira" }));
  fireEvent.click(screen.getByRole("button", { name: "Conectar carteira" }));
  await waitFor(() => expect(screen.getByText("Rede: BNB Smart Chain (56)")).toBeVisible());
  fireEvent.change(screen.getByPlaceholderText("100,00"), { target: { value: "1" } });
  network.chain = "0x1";
  await act(async () => {
    network.listeners.get("chainChanged")?.();
  });
  expect(await screen.findByText(/Rede incorreta ou não confirmada/)).toBeVisible();
  expect(screen.getByPlaceholderText("100,00")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Enviar para o robô" })).toBeDisabled();
});
