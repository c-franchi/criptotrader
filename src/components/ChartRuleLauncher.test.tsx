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
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("./CandleChart", () => ({
  CandleChart: ({
    onPickPrice,
    onEditLevel,
    levels,
    pickingPrice,
  }: {
    pickingPrice: boolean;
    onPickPrice: (p: { time: number; price: number }) => void;
    onEditLevel?: (id: string, price: number) => void;
    levels: { label: string }[];
  }) => (
    <div>
      <button disabled={!pickingPrice} onClick={() => onPickPrice({ time: 1, price: 90 })}>
        Ponto de entrada no gráfico
      </button>
      <button disabled={!pickingPrice} onClick={() => onPickPrice({ time: 2, price: 140 })}>
        Ponto de saída no gráfico
      </button>
      <button disabled={!onEditLevel} onClick={() => onEditLevel?.("entryBnb", 95)}>
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
function show(address = token) {
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
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

async function enter() {
  const button = screen.getByRole("button", { name: "Dividir valor e marcar entradas" });
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
  expect(screen.getByRole("button", { name: "Dividir valor e marcar entradas" })).toBeDisabled();
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
it("keeps open positions locked and closes the scoped tool when changing wallets", async () => {
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
  await screen.findByText(/Este token tem robô ligado ou posição aberta/);
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
