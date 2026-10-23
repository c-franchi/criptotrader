import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuidedBotSetup } from "./GuidedBotSetup";
import { EMPTY_CONFIG } from "@/lib/strategy";
const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  save: vi.fn(),
  start: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("@/lib/guidedBot.functions", () => ({
  getGuidedBotSettings: mocks.settings,
  saveGuidedBot: mocks.save,
  startGuidedBot: mocks.start,
  getBotReadiness: mocks.ready,
}));
vi.mock("@/lib/chain.functions", () => ({
  getMarket: async () => ({ pools: [{ supported: true, priceUsd: "100" }] }),
}));
vi.mock("@/lib/userTokens.functions", () => ({ getTokenTax: vi.fn() }));
vi.mock("@/lib/fx.functions", () => ({ getFxQuote: async () => ({ bnbUsd: 700, usdBrl: 5 }) }));
vi.mock("@/lib/bot.functions", () => ({ createBotWallet: vi.fn() }));
vi.mock("./FundBotDialog", () => ({ FundBotDialog: () => <button>Adicionar saldo</button> }));
vi.mock("./BotReadiness", () => ({ BotReadiness: () => <p>Verificações do servidor</p> }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(
  token = "0x1111111111111111111111111111111111111111",
  armed = false,
  select?: (v: string) => void,
) {
  mocks.settings.mockResolvedValue({
    strategy: {
      version: 2,
      config: {
        ...EMPTY_CONFIG,
        sizingMode: "fixo",
        buyAmount: 0.002,
        allocationBnb: 0.01,
        maxEntries: 3,
        dropPct: 5,
        stopLossPct: 8,
        takeProfits: [{ pct: 4, sellPct: 100 }],
        taxVerified: true,
      },
    },
    draft: null,
    bot: { mode: "estrategia", armed, strat_state: { tokens: 0, costBnb: 0 } },
  });
  mocks.save.mockResolvedValue({ id: "bot", version: 3 });
  mocks.start.mockResolvedValue({ ok: true });
  mocks.ready.mockResolvedValue({ ready: true });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GuidedBotSetup
        open
        onOpenChange={vi.fn()}
        walletScope="scope"
        walletName="Carteira teste"
        token={token}
        symbol="TEST"
        wallet={{ address: "0x2222222222222222222222222222222222222222", bnb: "0.1", tokens: [] }}
        onDone={vi.fn().mockResolvedValue(undefined)}
        {...(select
          ? {
              onSelectToken: select,
              tokens: [
                { address: token, symbol: "TEST" },
                { address: "0x3333333333333333333333333333333333333333", symbol: "OUTRA" },
              ],
            }
          : {})}
      />
    </QueryClientProvider>,
  );
}
it("saves configuration in one screen and never starts until the separate authorization", async () => {
  show();
  await screen.findByText("Comprar em etapas");
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(await screen.findByRole("spinbutton", { name: /Capital máximo/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("spinbutton", { name: "Comprar após queda de (%)" });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Salvar regras e preparar robô" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletScope: "scope",
        version: 2,
        settings: expect.objectContaining({ model: "dca", capital: 0.01, buyAmount: 0.002 }),
      }),
    }),
  );
  expect(mocks.start).not.toHaveBeenCalled();
  const button = await screen.findByRole("button", { name: "Confirmar e iniciar robô" });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei as regras e autorizo/ }));
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  await waitFor(() =>
    expect(mocks.start).toHaveBeenCalledWith({
      data: {
        walletScope: "scope",
        token: "0x1111111111111111111111111111111111111111",
        confirmation: "INICIAR ROBÔ",
      },
    }),
  );
});
it("explains an incompatible same-asset selection before allowing preparation", async () => {
  show("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c");
  await screen.findByText("Comprar em etapas");
  expect(screen.getByRole("alert").textContent).toMatch(/mesmo ativo/);
  expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
});
it("preserves existing running rules instead of editing them silently", async () => {
  show(undefined, true);
  expect((await screen.findByRole("alert")).textContent).toMatch(/posição aberta/);
  expect(screen.queryByRole("button", { name: "Salvar regras e preparar robô" })).toBeNull();
});

it("lets an incompatible running bot select another asset in the same assistant without modifying it", async () => {
  const select = vi.fn();
  show("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", true, select);
  const picker = await screen.findByRole("combobox", { name: "Moeda que quero comprar" });
  fireEvent.change(picker, { target: { value: "0x3333333333333333333333333333333333333333" } });
  expect(select).toHaveBeenCalledWith("0x3333333333333333333333333333333333333333");
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
});
