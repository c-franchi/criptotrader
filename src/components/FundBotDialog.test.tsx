import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({
  balance: 20000000000000000n,
  gas: 21000n,
  gasPrice: 100000000n,
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
  connectWallet: async () => ({ accounts: ["0x1111111111111111111111111111111111111111"] }),
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
      <FundBotDialog
        botAddress="0x2222222222222222222222222222222222222222"
        botBnb={0}
        need={{ reserve: 0.005, trade: 0.001, total: 0.006 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar da minha carteira" }));
    fireEvent.click(screen.getByRole("button", { name: "Conectar carteira" }));
    await waitFor(() => expect(screen.getByPlaceholderText("100,00")).not.toBeDisabled());
    fireEvent.change(screen.getByPlaceholderText("100,00"), { target: { value: String(amount) } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Enviar .*BNB.*para o robô/ })).toBeEnabled(),
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
