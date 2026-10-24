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
  capital: vi.fn(),
  execution: vi.fn(),
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
vi.mock("@/lib/bot.functions", () => ({
  createBotWallet: vi.fn(),
  getExecutionStatus: mocks.execution,
}));
vi.mock("@/lib/capital.functions", () => ({ getWalletCapital: mocks.capital }));
vi.mock("./FundBotDialog", () => ({ FundBotDialog: () => <button>Adicionar saldo</button> }));
vi.mock("./BotReadiness", () => ({
  BotReadiness: ({ onConfigure }: { onConfigure: (action: "liquidity") => void }) => (
    <div>
      <p>Verificações do servidor</p>
      <button onClick={() => onConfigure("liquidity")}>Revisar liquidez</button>
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});
function show(
  token = "0x1111111111111111111111111111111111111111",
  armed = false,
  select?: (v: string) => void,
  options: { userId?: string; walletScope?: string; onClose?: (v: boolean) => void } = {},
) {
  mocks.settings.mockResolvedValue({
    strategy: {
      version: 2,
      config: {
        ...EMPTY_CONFIG,
        sizingMode: "fixo",
        buyAmount: 0.002,
        allocationBnb: 0.01,
        gasReserveBnb: 0.0001,
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
  mocks.capital.mockResolvedValue({
    balance: "0.1",
    invested: "0.02",
    gas: "0.001",
    reserved: "0.03",
    free: "0.069",
    at: "2026-10-23T04:00:00Z",
    rows: [],
  });
  mocks.execution.mockResolvedValue({ locked: false });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GuidedBotSetup
        open
        onOpenChange={options.onClose ?? vi.fn()}
        userId={options.userId ?? "user-a"}
        walletScope={options.walletScope ?? "scope"}
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
  expect(await screen.findByRole("spinbutton", { name: /Capital máximo/ })).toBeTruthy();
  await screen.findByRole("spinbutton", { name: "Comprar após queda de (%)" });
  fireEvent.click(screen.getByRole("button", { name: "Revisar robô" }));
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
  expect(
    localStorage.getItem("bot-setup:v1:user-a:scope:0x1111111111111111111111111111111111111111"),
  ).toBeNull();
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
  expect(screen.getByRole("button", { name: "Revisar robô" })).toBeDisabled();
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

it("shows spendable balance before amount fields and updates it with the fee reserve", async () => {
  show();
  await screen.findByText("Comprar em etapas");
  expect(await screen.findByText(/Livre para configurar: 0,0689 BNB/)).toHaveTextContent(
    "R$ 241,15",
  );
  expect(screen.getByText(/Saldo na carteira: 0,1 BNB/)).toBeTruthy();
  expect(screen.getByText(/Em posições.*0,02 BNB/)).toBeTruthy();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Reserva para taxas (BNB)" }), {
    target: { value: "0.002" },
  });
  expect(screen.getByText(/Livre para configurar: 0,067 BNB/)).toBeTruthy();
});
it("closes with X without a browser confirmation and restores amounts, currency and step after unmount", async () => {
  const close = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const view = show(undefined, false, undefined, { onClose: close });
  await screen.findByText("Comprar em etapas");
  fireEvent.click(screen.getByRole("button", { name: "Reais · estimativa" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Capital máximo (R$)" }), {
    target: { value: "70" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Valor de cada compra (R$)" }), {
    target: { value: "14" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(close).toHaveBeenCalledWith(false);
  expect(confirm).not.toHaveBeenCalled();
  view.unmount();
  show();
  expect(await screen.findByRole("spinbutton", { name: "Capital máximo (R$)" })).toHaveValue(70);
  expect(screen.getByRole("spinbutton", { name: "Valor de cada compra (R$)" })).toHaveValue(14);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
});
it("isolates unfinished input by account, wallet and asset", async () => {
  let view = show();
  await screen.findByText("Comprar em etapas");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Capital máximo (BNB)" }), {
    target: { value: "0.045" },
  });
  view.unmount();
  for (const options of [{ userId: "user-b" }, { walletScope: "other-scope" }]) {
    view = show(undefined, false, undefined, options);
    await screen.findByText("Comprar em etapas");
    expect(screen.getByRole("spinbutton", { name: "Capital máximo (BNB)" })).toHaveValue(0.01);
    view.unmount();
  }
  view = show("0x3333333333333333333333333333333333333333");
  await screen.findByText("Comprar em etapas");
  view.unmount();
  show();
  expect(await screen.findByRole("spinbutton", { name: "Capital máximo (BNB)" })).toHaveValue(
    0.045,
  );
});
it("does not show a spendable amount while execution is pending", async () => {
  show();
  mocks.execution.mockResolvedValue({ locked: true });
  await screen.findByText("Comprar em etapas");
  fireEvent.click(screen.getByRole("button", { name: "Atualizar saldo" }));
  await screen.findByText(/Novas compras bloqueadas/);
  expect(screen.queryByText(/Livre para configurar:/)).toBeNull();
});
it("keeps the close action available when storage is denied", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  const close = vi.fn();
  show(undefined, false, undefined, { onClose: close });
  await screen.findByText(/navegador não permitiu/);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(close).toHaveBeenCalledWith(false);
});

it("preserves input when saved rules changed in another session and requires an explicit reload", async () => {
  const view = show();
  await screen.findByText("Comprar em etapas");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Capital máximo (BNB)" }), {
    target: { value: "0.045" },
  });
  const key = localStorage.key(0)!;
  const draft = JSON.parse(localStorage.getItem(key)!);
  localStorage.setItem(key, JSON.stringify({ ...draft, version: 1 }));
  view.unmount();
  show();
  expect(await screen.findByRole("spinbutton", { name: "Capital máximo (BNB)" })).toHaveValue(
    0.045,
  );
  expect(screen.getByText(/As regras foram alteradas em outra sessão/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Descartar preenchimento e carregar regras atuais" }),
  );
  await screen.findByText("Comprar em etapas");
  expect(screen.getByRole("spinbutton", { name: "Capital máximo (BNB)" })).toHaveValue(0.01);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("shows unavailable instead of a fabricated free balance on request failure", async () => {
  show();
  await screen.findByText("Comprar em etapas");
  mocks.capital.mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar saldo" }));
  await screen.findByText(/Não foi possível confirmar o saldo disponível/);
  expect(screen.queryByText(/Livre para configurar:/)).toBeNull();
});
it("lets X close during an explicitly requested save without starting the bot", async () => {
  const close = vi.fn();
  show(undefined, false, undefined, { onClose: close });
  await screen.findByText("Comprar em etapas");
  fireEvent.click(screen.getByRole("button", { name: "Revisar robô" }));
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar regras e preparar robô" }));
  await screen.findByRole("button", { name: "Salvando…" });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(close).toHaveBeenCalledWith(false);
  expect(mocks.start).not.toHaveBeenCalled();
  finish({ id: "bot", version: 3 });
  expect(await screen.findByRole("button", { name: "Confirmar e iniciar robô" })).toBeDisabled();
});

it("takes a saved liquidity problem directly to the visible safety field without losing purchase values", async () => {
  show();
  await screen.findByText("Comprar em etapas");
  fireEvent.click(screen.getByRole("button", { name: "Revisar robô" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar regras e preparar robô" }));
  fireEvent.click(await screen.findByRole("button", { name: "Revisar liquidez" }));
  const field = await screen.findByRole("spinbutton", { name: "Liquidez mínima do par (US$)" });
  expect(field).toHaveFocus();
  expect(field.closest("details")).toHaveAttribute("open");
  expect(screen.getByRole("spinbutton", { name: "Capital máximo (BNB)" })).toHaveValue(0.01);
  expect(mocks.start).not.toHaveBeenCalled();
});

it("retains older unfinished forms when adding the new safety fields", async () => {
  const first = show();
  await screen.findByText("Comprar em etapas");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Capital máximo (BNB)" }), {
    target: { value: "0.0123" },
  });
  const key = "bot-setup:v1:user-a:scope:0x1111111111111111111111111111111111111111";
  const older = JSON.parse(localStorage.getItem(key)!);
  delete older.form.minLiquidityUsd;
  delete older.form.maxGasGwei;
  localStorage.setItem(key, JSON.stringify(older));
  first.unmount();
  show();
  expect(await screen.findByRole("spinbutton", { name: "Capital máximo (BNB)" })).toHaveValue(
    0.0123,
  );
});

it("takes an incomplete grid directly to the range field instead of proceeding without an explanation", async () => {
  show();
  await screen.findByText("Comprar em etapas");
  fireEvent.click(screen.getByRole("radio", { name: /Comprar e vender numa faixa/ }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar robô" }));
  expect(await screen.findByText(/Defina uma faixa válida/)).toBeTruthy();
  expect(screen.getByRole("spinbutton", { name: "Preço mínimo (BNB por moeda)" })).toHaveFocus();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
});
