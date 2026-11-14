import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EMPTY_CONFIG } from "@/lib/strategy";
const io = vi.hoisted(() => ({
  settings: vi.fn(),
  gas: vi.fn(),
  market: vi.fn(),
  save: vi.fn(),
  limit: vi.fn(),
  start: vi.fn(),
  navigate: vi.fn(),
  wallet: vi.fn(),
  create: vi.fn(),
  ready: vi.fn(),
  tax: vi.fn(),
  capital: vi.fn(),
  selection: { walletScope: "scope-a", name: "Carteira A", address: "0xsource", ready: true },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-a" } }) }));
vi.mock("@/hooks/useSelectedWallet", () => ({ useSelectedWallet: () => io.selection }));
vi.mock("@/lib/guidedBot.functions", () => ({
  getGuidedBotSettings: io.settings,
  getBotReadiness: io.ready,
  startGuidedBot: io.start,
}));
vi.mock("@/lib/chartRule.functions", () => ({
  getChartGasReference: io.gas,
  saveChartPlan: io.save,
  updateChartGasLimit: io.limit,
}));
vi.mock("@/lib/capital.functions", () => ({ getWalletCapital: io.capital }));
vi.mock("@/lib/fx.functions", () => ({
  getFxQuote: async () => ({ at: Date.now(), bnbUsd: 100000, usdBrl: 5, usdEur: 0.9 }),
}));
vi.mock("@/lib/chain.functions", () => ({ getTradingMarket: io.market }));
vi.mock("@/lib/bot.functions", () => ({ getBotWallet: io.wallet, createBotWallet: io.create }));
vi.mock("@/lib/userTokens.functions", () => ({ getTokenTax: io.tax }));
vi.mock("@/hooks/useChartPool", () => ({ useChartPool: () => "pair" }));
vi.mock("@/hooks/useCandles", () => ({ useCandles: () => ({ data: [] }) }));
vi.mock("./FundBotDialog", () => ({ FundBotDialog: () => <button>Adicionar BNB</button> }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => io.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("./CandleChart", () => ({
  CandleChart: ({
    onPickPrice,
    onEditLevel,
    onCommitLevel,
    levels,
    pickingPrice,
  }: {
    pickingPrice: boolean;
    onPickPrice: (p: { time: number; price: number }) => void;
    onEditLevel?: (id: string, price: number) => void;
    onCommitLevel?: (id: string, price: number) => void;
    levels: { label: string }[];
  }) => (
    <div>
      <button disabled={!pickingPrice} onClick={() => onPickPrice({ time: 1, price: 90 })}>
        Ponto de entrada no gráfico
      </button>
      <button disabled={!pickingPrice} onClick={() => onPickPrice({ time: 2, price: 140 })}>
        Ponto de saída no gráfico
      </button>
      <button
        disabled={!onEditLevel && !onCommitLevel}
        onClick={() => (onCommitLevel ?? onEditLevel)?.("entry:0", 95)}
      >
        Arrastar entrada no gráfico
      </button>
      {levels.map((l, i) => (
        <span key={i}>Linha: {l.label}</span>
      ))}
    </div>
  ),
}));
import { ChartRuleEditor, ChartRuleLauncher } from "./ChartRuleLauncher";
const token = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
const clients: QueryClient[] = [];
beforeEach(() => {
  io.selection = { walletScope: "scope-a", name: "Carteira A", address: "0xsource", ready: true };
  io.settings.mockResolvedValue({
    strategy: { version: 2, config: { ...EMPTY_CONFIG, sizingMode: "fixo", buyAmount: 0.01 } },
    draft: null,
    bot: null,
  });
  io.gas.mockResolvedValue({
    gasBuyBnb: "0.00001",
    gasSellBnb: "0.00002",
    at: new Date().toISOString(),
    buyUnits: 300000,
    sellUnits: 460000,
  });
  io.market.mockImplementation(async () => ({
    fetchedAt: new Date().toISOString(),
    error: null,
    pools: [{ supported: true, pairAddress: "pair", priceUsd: "100", priceNative: "0.001" }],
  }));
  io.wallet.mockResolvedValue({ address: "0xrobot", bnb: "1", tokens: [] });
  io.ready.mockResolvedValue({ ready: true, errors: [] });
  io.save.mockResolvedValue({ id: "bot", version: 3 });
  io.start.mockResolvedValue({});
  io.navigate.mockResolvedValue(undefined);
  io.capital.mockImplementation(async () => ({
    free: "0.03",
    address: "0xrobot",
    at: new Date().toISOString(),
  }));
  io.tax.mockResolvedValue({ tax: null });
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.clearAllMocks();
  localStorage.clear();
});
function show(address = token, onClose = vi.fn(), onSaved?: () => Promise<void>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ChartRuleEditor
        token={address}
        symbol="TEST"
        userId="user-a"
        walletScope="scope-a"
        walletName="Carteira A"
        sourceAddress="0xsource"
        onClose={onClose}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
}

async function enter() {
  const button = screen.getByRole("button", {
    name: /Dividir valor e marcar entradas|Revisar valor e entradas/,
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByRole("region", { name: "Marcar entradas" });
}
it("shows local money, splits free native funds across multiple clicks and saves paused with explicit review", async () => {
  show();
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(15000),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Quantidade de entradas" }), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Quantidade de saídas" }), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "50%" }));
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Preço da entrada 2" }), {
    target: { value: "400" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  expect(screen.getAllByText(/Saída [12] ·/)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  expect(screen.getByRole("alert").textContent).toContain("Escolha explicitamente");
  fireEvent.click(screen.getByRole("radio", { name: /Manter os tokens/ }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  expect(screen.getByRole("button", { name: /Salvar atividade/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Entendo que, se apenas parte/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei carteira, valor/ }));
  fireEvent.click(screen.getByRole("button", { name: /Salvar atividade/ }));
  await screen.findByText("Atividade salva · robô pausado");
  expect(io.save).toHaveBeenCalledWith({
    data: expect.objectContaining({
      walletScope: "scope-a",
      token,
      settings: expect.objectContaining({
        budgetBnb: "0.015000000000000000",
        entryPrices: [0.0009, 0.0008],
        stopBnb: null,
        stopChoice: "none",
      }),
    }),
  });
  expect(io.start).not.toHaveBeenCalled();
  expect(io.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Iniciar este robô" })).toBeDisabled();
});
it("changes display currency without changing the selected canonical budget", async () => {
  show();
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(15000),
  );
  fireEvent.click(screen.getByRole("button", { name: "25%" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Moeda dos valores" }), {
    target: { value: "USD" },
  });
  expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(750);
  fireEvent.change(screen.getByRole("combobox", { name: "Moeda dos valores" }), {
    target: { value: "BNB" },
  });
  expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(0.0075);
});
it("does not convert unavailable funds or unknown token taxes into zero", async () => {
  show(`0x${"8".repeat(40)}`);
  await screen.findByText(/Falta confirmar as taxas/);
  expect(
    screen.getByRole("button", {
      name: /Dividir valor e marcar entradas|Revisar valor e entradas/,
    }),
  ).toBeDisabled();
  expect(io.save).not.toHaveBeenCalled();
});
it("disables point selection when the native quote is stale", async () => {
  io.market.mockResolvedValue({
    fetchedAt: new Date(Date.now() - 60000).toISOString(),
    error: null,
    pools: [{ supported: true, priceUsd: "100", priceNative: "0.001" }],
  });
  show();
  await enter();
  expect(screen.getByRole("button", { name: "Ponto de entrada no gráfico" })).toBeDisabled();
  expect(screen.getByText(/Aguardando cotação atual/)).toBeTruthy();
});
it("explains the replacement option and closes the scoped tool when changing wallets", async () => {
  io.settings.mockResolvedValue({
    strategy: { version: 2, config: EMPTY_CONFIG },
    bot: { armed: false, strat_state: { tokens: 10, costBnb: 0.01 } },
    draft: null,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = () => (
    <QueryClientProvider client={client}>
      <ChartRuleLauncher token={token} symbol="TEST" />
    </QueryClientProvider>
  );
  const { rerender } = render(view());
  fireEvent.click(screen.getByRole("button", { name: "Criar regra pelo gráfico" }));
  await screen.findByText(/Há uma atividade anterior registrada/);
  io.selection = { ...io.selection, walletScope: "scope-b", name: "Carteira B" };
  rerender(view());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});

it("keeps manual exits unchanged when editing the target and shows separate costs, entry results and adverse execution", async () => {
  show();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Preço da saída 1" }), {
    target: { value: "456" },
  });
  const exit = screen.getByRole("spinbutton", { name: "Preço da saída 1" });
  expect(exit).toHaveValue(456);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Meta líquida inicial" }), {
    target: { value: "15" },
  });
  expect(exit).toHaveValue(456);
  expect(screen.getByText(/Saídas definidas por você/)).toBeTruthy();
  expect(screen.getByText(/Ganho bruto pelos preços escolhidos/)).toBeTruthy();
  expect(screen.getByText(/Taxas e gás estimados/)).toBeTruthy();
  expect(screen.getByText(/Se a execução piorar toda essa margem/)).toBeTruthy();
  expect(screen.getByText(/não uma taxa fixa/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Aplicar sugestão às saídas" }));
  expect(Number((exit as HTMLInputElement).value)).toBeGreaterThan(456);
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});

it("shows a saved gas-ceiling blocker with a local-money preview and only changes the ceiling after explicit saving", async () => {
  io.ready.mockResolvedValue({
    ready: false,
    errors: ["Preço do gás acima do limite, não do saldo."],
    issues: [{ action: "gas" }],
    at: new Date().toISOString(),
    networkGasGwei: "0.05",
    configuredGasGwei: 0.0001,
    gasBuyReferenceBnb: "0.000015",
    gasSellReferenceBnb: "0.000023",
    version: 3,
  });
  io.limit.mockResolvedValue({ version: 4, maxGasGwei: 0.05 });
  show();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  fireEvent.click(screen.getByRole("radio", { name: /Manter os tokens/ }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei carteira, valor/ }));
  fireEvent.click(screen.getByRole("button", { name: /Salvar atividade/ }));
  await screen.findByText("Atividade salva · robô pausado");
  expect(screen.getByRole("button", { name: "Iniciar este robô" })).toBeDisabled();
  fireEvent.click(await screen.findByRole("button", { name: "Revisar limite de gás" }));
  expect(screen.getByText(/Gwei não é BNB/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Usar referência atual no limite" }));
  expect(screen.getByRole("spinbutton", { name: "Novo limite do gás" })).toHaveValue(0.05);
  expect(io.limit).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Salvar limite · manter pausado" }));
  await waitFor(() =>
    expect(io.limit).toHaveBeenCalledWith({
      data: { walletScope: "scope-a", token, maxGasGwei: 0.05, version: 3, draftRevision: 0 },
    }),
  );
  expect(io.save).toHaveBeenCalledTimes(1);
  expect(io.start).not.toHaveBeenCalled();
});
it("warns before saving when an inherited ceiling is below the network reference, with an explicit suggestion only", async () => {
  io.settings.mockResolvedValue({
    strategy: { version: 2, config: { ...EMPTY_CONFIG, maxGasGwei: 0.0001 } },
    bot: null,
    draft: null,
  });
  show();
  await screen.findByText(/está abaixo da referência da rede/);
  expect(io.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Usar referência atual no limite" }));
  expect(screen.queryByText(/está abaixo da referência da rede/)).toBeNull();
  expect(io.save).not.toHaveBeenCalled();
  expect(io.limit).not.toHaveBeenCalled();
});

it("checks an existing saved chart activity without saving it again or changing any points", async () => {
  io.settings.mockResolvedValue({
    strategy: {
      version: 8,
      config: {
        ...EMPTY_CONFIG,
        guidedModel: "chart",
        maxGasGwei: 0.0001,
        chartRule: {
          id: "saved-rule",
          entryBnb: 0.001,
          exitBnb: 0.00103,
          stopBnb: null,
          gasBuyBnb: 0.000015,
          gasSellBnb: 0.000023,
        },
      },
    },
    draft: null,
    bot: { id: "existing", armed: false, strat_state: { tokens: 0, costBnb: 0 } },
  });
  io.ready.mockResolvedValue({
    ready: false,
    errors: ["Preço do gás acima do limite, não do saldo."],
    at: new Date().toISOString(),
    networkGasGwei: "0.05",
    configuredGasGwei: 0.0001,
    gasBuyReferenceBnb: "0.000015",
    version: 8,
  });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Conferir atividade já salva" }));
  await screen.findByText("Atividade salva · robô pausado");
  expect(await screen.findByRole("button", { name: "Revisar limite de gás" })).toBeEnabled();
  expect(io.save).not.toHaveBeenCalled();
  expect(io.limit).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});

it("requires a clear confirmation after selecting or dragging a chart point and preserves it on cancel", async () => {
  show();
  await enter();
  const input = screen.getByRole("spinbutton", { name: "Preço da entrada 1" });
  const continueButton = screen.getByRole("button", { name: "Continuar para saídas" });
  expect(input).toHaveValue(null);
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(input).toHaveValue(null);
  expect(continueButton).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar escolha" }));
  expect(input).toHaveValue(null);
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  expect(input).toHaveValue(450);
  fireEvent.click(screen.getByRole("button", { name: "Arrastar entrada no gráfico" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(input).toHaveValue(450);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar escolha" }));
  expect(input).toHaveValue(450);
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});

it("requires an explicit replacement confirmation for old positions and never starts on save", async () => {
  io.settings.mockResolvedValue({
    strategy: { version: 2, config: { ...EMPTY_CONFIG, sizingMode: "fixo" } },
    draft: null,
    bot: {
      id: "33333333-3333-4333-8333-333333333333",
      updated_at: "2026-11-09T10:00:00Z",
      armed: false,
      strat_state: { tokens: 2, costBnb: 0.01 },
    },
  });
  show();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  fireEvent.click(screen.getByRole("radio", { name: /Manter os tokens/ }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei carteira, valor/ }));
  expect(screen.getByRole("button", { name: "Substituir pela nova atividade" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Substituir pela nova atividade" }));
  const confirm = screen.getByRole("button", { name: "Confirmar substituição e salvar pausado" });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Manter atividade anterior" }));
  expect(io.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Guardar rascunho local/ }));
  expect(screen.getByText(/Rascunho guardado neste aparelho/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Substituir pela nova atividade" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Entendo que os tokens anteriores/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar substituição e salvar pausado" }));
  await waitFor(() =>
    expect(io.save).toHaveBeenCalledWith({
      data: expect.objectContaining({
        replacement: {
          confirmation: "SUBSTITUIR ATIVIDADE",
          botId: "33333333-3333-4333-8333-333333333333",
          updatedAt: "2026-11-09T10:00:00Z",
          state: { tokens: 2, costBnb: 0.01 },
        },
      }),
    }),
  );
  expect(io.start).not.toHaveBeenCalled();
});

it("lets a reviewed PAUSED strategy save with stale display quote and local balance, server still checks funds", async () => {
  show();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  fireEvent.click(screen.getByRole("radio", { name: /Manter os tokens/ }));
  const stale = new Date(Date.now() - 120000).toISOString();
  io.market.mockResolvedValue({
    fetchedAt: stale,
    error: null,
    pools: [{ supported: true, pairAddress: "pair", priceUsd: "100", priceNative: "0.001" }],
  });
  io.capital.mockResolvedValue({ free: "0.03", address: "0xrobot", at: stale });
  const client = clients.at(-1)!;
  await client.invalidateQueries({ queryKey: ["trading-market", token] });
  await client.invalidateQueries({ queryKey: ["chart-plan-capital", "user-a", "scope-a"] });
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei carteira, valor/ }));
  await waitFor(() => {
    expect(screen.getByText(/Cotação atual indisponível/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Salvar atividade/ })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole("button", { name: /Salvar atividade/ }));
  await screen.findByText("Atividade salva · robô pausado");
  expect(io.save).toHaveBeenCalledTimes(1);
  expect(io.start).not.toHaveBeenCalled();
});

it("identifies the actual budget percentage and clears presets for a custom amount without saving", async () => {
  show();
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(15000),
  );
  expect(screen.getByRole("button", { name: /Máximo/ })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "25%" }));
  expect(screen.getByText("25% selecionado")).toBeVisible();
  expect(screen.getByRole("button", { name: "25%" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(3750);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Valor para a atividade" }), {
    target: { value: "1000" },
  });
  expect(screen.getByText("Valor personalizado")).toBeVisible();
  for (const name of ["25%", "50%", "75%", /Máximo/])
    expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
  expect(io.create).not.toHaveBeenCalled();
});

it("keeps the selected fraction when changing display currency", async () => {
  show();
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(15000),
  );
  fireEvent.click(screen.getByRole("button", { name: "50%" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Moeda dos valores" }), {
    target: { value: "USD" },
  });
  expect(screen.getByText("50% selecionado")).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(1500);
  expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "true");
});

it("labels the chosen quote clearly without presenting it as an invested total", async () => {
  show();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  expect(screen.getByText("Preço de compra do TEST")).toBeVisible();
  expect(screen.getByText("Esta é a cotação da moeda, não o total investido.")).toBeVisible();
  expect(screen.queryByText(/por TEST/)).toBeNull();
});

it("automatically prompts the next entry instead of showing a loading message", async () => {
  show();
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Quantidade de entradas" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Quantidade de entradas" }), {
    target: { value: "2" },
  });
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  expect(screen.getByRole("button", { name: "Marque a entrada 2 no gráfico" })).toBeVisible();
  expect(screen.getByText("Entrada 2: toque no gráfico")).toBeVisible();
  expect(screen.queryByText(/Selecionando entrada/)).toBeNull();
  expect(screen.getByRole("spinbutton", { name: "Preço da entrada 1" })).toHaveValue(450);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Preço da entrada 2" }), {
    target: { value: "400" },
  });
  expect(screen.getByRole("spinbutton", { name: "Preço da entrada 2" })).toHaveValue(400);
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});

async function saveForStart() {
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  fireEvent.click(screen.getByRole("radio", { name: /Manter os tokens/ }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei carteira, valor/ }));
  fireEvent.click(screen.getByRole("button", { name: /Salvar atividade/ }));
  await screen.findByText("Atividade salva · robô pausado");
  fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo iniciar/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Iniciar este robô" })).toBeEnabled(),
  );
}
it("opens the correct robot and closes the wizard only after a confirmed start", async () => {
  const onClose = vi.fn();
  show(token, onClose);
  await saveForStart();
  fireEvent.click(screen.getByRole("button", { name: "Iniciar este robô" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(io.navigate).toHaveBeenCalledWith({
    to: "/grade",
    search: { token, carteira: "scope-a" },
    resetScroll: true,
  });
  expect(io.start).toHaveBeenCalledTimes(1);
});
it("keeps a failed start in the wizard and never navigates as if it succeeded", async () => {
  io.start.mockRejectedValue(new Error("Falha de rede"));
  const onClose = vi.fn();
  show(token, onClose);
  await saveForStart();
  fireEvent.click(screen.getByRole("button", { name: "Iniciar este robô" }));
  await waitFor(() => expect(io.start).toHaveBeenCalledOnce());
  expect(io.navigate).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
it("does not offer a second start when only the post-success refresh or navigation fails", async () => {
  const onSaved = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Refresh failed"));
  io.navigate.mockRejectedValue(new Error("Navigation failed"));
  const onClose = vi.fn();
  show(token, onClose, onSaved);
  await saveForStart();
  fireEvent.click(screen.getByRole("button", { name: "Iniciar este robô" }));
  await screen.findByText(/Não foi possível abrir o acompanhamento/);
  expect(screen.getByRole("button", { name: "Iniciar este robô" })).toBeDisabled();
  expect(io.start).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});

it("keeps the chosen USD entry fixed during a correlated BNB/asset fall and persists that anchor", async () => {
  show();
  fireEvent.change(screen.getByRole("combobox", { name: "Moeda dos valores" }), {
    target: { value: "USD" },
  });
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  expect(screen.getByRole("spinbutton", { name: "Preço da entrada 1" })).toHaveValue(90);
  io.market.mockResolvedValue({
    fetchedAt: new Date().toISOString(),
    error: null,
    pools: [{ supported: true, pairAddress: "pair", priceUsd: "80", priceNative: "0.0016" }],
  });
  await clients.at(-1)!.invalidateQueries({ queryKey: ["trading-market", token] });
  expect(screen.getByRole("spinbutton", { name: "Preço da entrada 1" })).toHaveValue(90);
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  fireEvent.click(screen.getByRole("radio", { name: /Manter os tokens/ }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei carteira, valor/ }));
  fireEvent.click(screen.getByRole("button", { name: /Salvar atividade/ }));
  await screen.findByText("Atividade salva · robô pausado");
  const saved = io.save.mock.calls.at(-1)![0].data.settings;
  expect(saved.priceAnchor).toEqual({ unit: "USD", bnbUsd: 50000 });
  expect(saved.entryPrices[0] * saved.priceAnchor.bnbUsd).toBeCloseTo(90);
  expect(io.start).not.toHaveBeenCalled();
});

it("never silently converts a legacy saved activity and offers an explicit reviewed draft conversion", async () => {
  io.settings.mockResolvedValue({
    strategy: {
      version: 8,
      config: {
        ...EMPTY_CONFIG,
        guidedModel: "chart",
        chartRule: {
          id: "saved",
          entryBnb: 0.001,
          exitBnb: 0.0013,
          stopBnb: null,
          gasBuyBnb: 0.00001,
          gasSellBnb: 0.00002,
        },
      },
    },
    draft: null,
    bot: { armed: true },
  });
  show();
  const button = await screen.findByRole("button", {
    name: "Fixar os preços exibidos em US$ neste rascunho",
  });
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(screen.getByText(/Pontos fixos em US\$ no gráfico/)).toBeVisible();
  expect(io.save).not.toHaveBeenCalled();
});

it("edits the saved allocation, entries, exits and stop rather than leftover funds or an old creation draft", async () => {
  const rule = {
    id: "saved-rule",
    unit: "BNB",
    version: 2,
    projectionVersion: 2,
    priceAnchor: { unit: "USD", bnbUsd: 100000 },
    entryBnb: 0.0009,
    exitBnb: 0.0013,
    stopBnb: 0.0006,
    gasBuyBnb: 0.000001,
    gasSellBnb: 0.000004,
    entries: [
      { priceBnb: 0.0009, amountBnb: "0.000023" },
      { priceBnb: 0.0007, amountBnb: "0.000023" },
    ],
    exits: [{ priceBnb: 0.0013, sharePct: 100 }],
  };
  io.settings.mockResolvedValue({
    strategy: { version: 8, config: { ...EMPTY_CONFIG, guidedModel: "chart", chartRule: rule } },
    draft: null,
    bot: { id: "existing", armed: false, strat_state: {} },
  });
  io.capital.mockImplementation(async () => ({
    free: "0.00001",
    editAvailable: "0.00006",
    address: "0xrobot",
    at: new Date().toISOString(),
  }));
  const oldKey = `cryptobot:chart-plan:v2:user-a:scope-a:${token.toLowerCase()}`;
  const oldDraft = JSON.stringify({
    version: 8,
    revision: 0,
    budget: "0.00001",
    entryCount: 1,
    exitCount: 1,
    entries: [0.0001],
  });
  localStorage.setItem(oldKey, oldDraft);
  show();
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(26),
  );
  expect(screen.getByText(/Editando atividade salva/)).toBeVisible();
  expect(io.capital).toHaveBeenCalledWith({ data: { walletScope: "scope-a", editToken: token } });
  await enter();
  expect(screen.getByRole("spinbutton", { name: "Preço da entrada 1" })).toHaveValue(450);
  expect(screen.getByRole("spinbutton", { name: "Preço da entrada 2" })).toHaveValue(350);
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  expect(screen.getByRole("spinbutton", { name: "Preço da saída 1" })).toHaveValue(650);
  expect(screen.getByRole("radio", { name: /Sim, usar um limite/ })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei carteira, valor/ }));
  fireEvent.click(screen.getByRole("button", { name: /Salvar atividade/ }));
  await screen.findByText("Atividade salva · robô pausado");
  const payload = io.save.mock.calls.at(-1)![0].data;
  expect(Number(payload.settings.budgetBnb)).toBeCloseTo(0.000052, 18);
  expect(payload.settings.entryPrices).toEqual([0.0009, 0.0007]);
  expect(payload.settings.exitPrices).toEqual([0.0013]);
  expect(payload.settings.stopBnb).toBe(0.0006);
  expect(payload.settings.stopChoice).toBe("price");
  expect(payload.version).toBe(8);
  expect(localStorage.getItem(oldKey)).toBe(oldDraft);
  expect(io.start).not.toHaveBeenCalled();
});

it("freezes suggested exit prices until the user explicitly requests a new suggestion", async () => {
  show();
  fireEvent.change(screen.getByRole("combobox", { name: "Moeda dos valores" }), {
    target: { value: "USD" },
  });
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  const input = screen.getByRole("spinbutton", { name: "Preço da saída 1" });
  const before = (input as HTMLInputElement).value;
  io.market.mockResolvedValue({
    fetchedAt: new Date().toISOString(),
    error: null,
    pools: [{ supported: true, pairAddress: "pair", priceUsd: "80", priceNative: "0.0016" }],
  });
  await clients.at(-1)!.invalidateQueries({ queryKey: ["trading-market", token] });
  expect((input as HTMLInputElement).value).toBe(before);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Meta líquida inicial" }), {
    target: { value: "20" },
  });
  expect((input as HTMLInputElement).value).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Aplicar sugestão às saídas" }));
  expect((input as HTMLInputElement).value).not.toBe(before);
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});

it("opens the saved activity first and restores its separate edit draft only on request", async () => {
  io.settings.mockResolvedValue({
    strategy: {
      version: 8,
      config: {
        ...EMPTY_CONFIG,
        chartRule: {
          id: "saved",
          version: 2,
          priceAnchor: { unit: "USD", bnbUsd: 100000 },
          entryBnb: 0.0009,
          exitBnb: 0.0013,
          stopBnb: null,
          entries: [{ priceBnb: 0.0009, amountBnb: "0.00005" }],
          exits: [{ priceBnb: 0.0013, sharePct: 100 }],
          gasBuyBnb: 0.000001,
          gasSellBnb: 0.000001,
        },
      },
    },
    draft: null,
    bot: { id: "existing", armed: true, strat_state: {} },
  });
  const key = `cryptobot:chart-plan:edit:v1:user-a:scope-a:${token.toLowerCase()}`;
  const draft = JSON.stringify({
    version: 8,
    revision: 0,
    budget: "0.00004",
    entryCount: 1,
    exitCount: 1,
    entries: [0.0008],
    exits: [0.0012],
    stopChoice: "none",
    stop: 0,
    priceAnchor: { unit: "USD", bnbUsd: 100000 },
  });
  localStorage.setItem(key, draft);
  show();
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(26),
  );
  expect(localStorage.getItem(key)).toBe(draft);
  fireEvent.click(screen.getByRole("button", { name: "Recuperar edição não salva deste robô" }));
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Valor para a atividade" })).toHaveValue(20),
  );
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});

it("labels the existing rule as editing and opens it without creating or starting another robot", async () => {
  io.settings.mockResolvedValue({
    strategy: {
      version: 8,
      config: {
        ...EMPTY_CONFIG,
        chartRule: {
          id: "saved",
          entryBnb: 0.001,
          exitBnb: 0.0013,
          stopBnb: null,
          gasBuyBnb: 0.000001,
          gasSellBnb: 0.000001,
        },
      },
    },
    draft: null,
    bot: { id: "existing", armed: true },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ChartRuleLauncher token={token} symbol="BTCB" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Editar atividade e preços" }));
  expect(await screen.findByRole("heading", { name: "Editar atividade · BTCB" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Revisar valor e entradas" })).toBeVisible();
  expect(io.create).not.toHaveBeenCalled();
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});

it("does not apply an old form using a newer strategy version fetched in the background", async () => {
  show();
  await enter();
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar ponto escolhido" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar para saídas" }));
  fireEvent.click(screen.getByRole("radio", { name: /Manter os tokens/ }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar atividade" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisei carteira, valor/ }));
  io.settings.mockResolvedValue({
    strategy: { version: 3, config: EMPTY_CONFIG },
    draft: null,
    bot: null,
  });
  await clients
    .at(-1)!
    .invalidateQueries({ queryKey: ["chart-plan-settings", "user-a", "scope-a", token] });
  expect(await screen.findByText(/A atividade foi alterada em outra janela/)).toBeVisible();
  expect(screen.getByRole("button", { name: /Salvar atividade/ })).toBeDisabled();
  const draft = JSON.parse(
    localStorage.getItem(`cryptobot:chart-plan:v2:user-a:scope-a:${token.toLowerCase()}`)!,
  );
  expect(draft.version).toBe(2);
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});
