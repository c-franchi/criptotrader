import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManualAutoSetup } from "./ManualAutoSetup";
const io = vi.hoisted(() => ({
  save: vi.fn(),
  start: vi.fn(),
  settings: vi.fn(),
  wallet: vi.fn(),
}));
vi.mock("@/lib/guidedBot.functions", () => ({
  getGuidedBotSettings: io.settings,
  startGuidedBot: io.start,
  getBotReadiness: async () => ({
    errors: [],
    feeBnb: 0.00001,
    exchangeCostBnb: 0.00002,
    gasSellReferenceBnb: "0.00002",
  }),
}));
vi.mock("@/lib/manualAuto.functions", () => ({ saveManualAuto: io.save }));
vi.mock("@/lib/fx.functions", () => ({
  getFxQuote: async () => ({ bnbUsd: 500, usdBrl: 5, at: Date.now() }),
}));
vi.mock("@/lib/bot.functions", () => ({ getBotWallet: io.wallet, createBotWallet: vi.fn() }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});
it("walks through amount, entry, exit and explicitly no stop, saving without starting a funded bot", async () => {
  io.settings.mockResolvedValue({ strategy: { version: 3 }, draft: { revision: 2 } });
  io.wallet.mockResolvedValue({ address: "0x1", bnb: "0.1" });
  io.save.mockResolvedValue({ entryUsd: 100 });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ManualAutoSetup
        userId="u"
        walletScope="00000000-0000-0000-0000-000000000000"
        token="0x1111111111111111111111111111111111111111"
        symbol="TEST"
        onDone={async () => {}}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Manual automático ·/ }));
  await waitFor(() => expect(io.settings).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Quanto quer aplicar no robô?"), {
    target: { value: "10" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.change(screen.getByLabelText(/Comprar quando o preço/), { target: { value: "500" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.change(screen.getByLabelText(/Vender quando o preço/), { target: { value: "501" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Escolha se deseja stop loss");
  fireEvent.click(screen.getByRole("button", { name: "Não, prosseguir sem stop" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Salvar minha configuração" }));
  });
  expect(io.save).toHaveBeenCalledWith({
    data: expect.objectContaining({
      version: 3,
      draftRevision: 2,
      settings: expect.objectContaining({
        capitalBnb: 0.004,
        entryValue: 100,
        exitValue: 100.2,
        stopLossPct: null,
      }),
    }),
  });
  expect(io.start).not.toHaveBeenCalled();
  expect(screen.getByText(/O robô ainda está pausado/)).toBeInTheDocument();
});
