import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EMPTY_CONFIG } from "@/lib/strategy";
const io = vi.hoisted(() => ({
  settings: vi.fn(),
  gas: vi.fn(),
  market: vi.fn(),
  save: vi.fn(),
  start: vi.fn(),
  wallet: vi.fn(),
  create: vi.fn(),
  ready: vi.fn(),
  tax: vi.fn(),
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
  saveChartRule: io.save,
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
async function mark() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Ponto de entrada no gráfico" })).toBeEnabled(),
  );
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Gás estimado da compra (BNB)" })).toHaveValue(
      0.00001,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  fireEvent.click(screen.getByRole("button", { name: "Ponto de saída no gráfico" }));
}
it("marks native levels, shows costs, reviews and saves paused without ever starting automatically", async () => {
  show();
  await mark();
  expect(screen.getByRole("spinbutton", { name: "Entrada (BNB por token)" })).toHaveValue(0.0009);
  expect(screen.getByRole("spinbutton", { name: "Saída (BNB por token)" })).toHaveValue(0.0014);
  expect(screen.getByText("Linha: Equilíbrio estimado")).toBeTruthy();
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText(/Conferi as taxas/));
  fireEvent.click(screen.getByLabelText(/Revisei a taxa da DEX/));
  fireEvent.click(screen.getByRole("radio", { name: /Manter os tokens sem stop/ }));
  fireEvent.click(screen.getByLabelText(/Revisei carteira, token, pontos e stop/));
  fireEvent.click(screen.getByRole("button", { name: "Revisar regra gráfica" }));
  expect(screen.getByRole("region", { name: "Revisão da regra gráfica" })).toBeTruthy();
  expect(io.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Salvar regra · manter pausado" }));
  await screen.findByText("Regra salva · robô pausado");
  expect(io.save).toHaveBeenCalledWith({
    data: expect.objectContaining({
      walletScope: "scope-a",
      token,
      version: 2,
      draftRevision: 0,
      settings: expect.objectContaining({
        entryBnb: 0.0009,
        exitBnb: 0.0014,
        stopChoice: "none",
        stopBnb: null,
        taxesConfirmed: true,
        costsConfirmed: true,
      }),
    }),
  });
  expect(io.start).not.toHaveBeenCalled();
  expect(io.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Iniciar este robô" })).toBeDisabled();
});
it("never treats unknown tax as zero and requires an explicit stop choice", async () => {
  show(`0x${"8".repeat(40)}`);
  await mark();
  expect(screen.getByRole("spinbutton", { name: "Taxa do token na compra (%)" })).toHaveValue(null);
  expect(screen.queryByText("Linha: Equilíbrio estimado")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Revisar regra gráfica" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(io.save).not.toHaveBeenCalled();
  expect(screen.getByRole("radio", { name: /Manter os tokens sem stop/ })).not.toBeChecked();
});
it("shows a clearly partial fee-only reference immediately after the first entry point without inventing a cash profit", async () => {
  io.settings.mockResolvedValue({
    strategy: { version: 0, config: EMPTY_CONFIG },
    draft: null,
    bot: null,
  });
  show();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Ponto de entrada no gráfico" })).toBeEnabled(),
  );
  await screen.findByText(/Taxas de referência carregadas/);
  fireEvent.click(screen.getByRole("button", { name: "Ponto de entrada no gráfico" }));
  expect(screen.getByText("Linha: Equilíbrio parcial · sem gás")).toBeTruthy();
  expect(screen.getByText(/Referência parcial somente com taxas e margem/)).toBeTruthy();
  expect(screen.queryByText("Lucro ou prejuízo líquido estimado")).toBeNull();
  expect(io.save).not.toHaveBeenCalled();
});
it("blocks click picking and saving when the live native quote is stale", async () => {
  io.market.mockResolvedValue({
    fetchedAt: new Date(Date.now() - 60000).toISOString(),
    error: null,
    pools: [{ supported: true, priceUsd: "100", priceNative: "0.001" }],
  });
  show();
  await screen.findByText(/Cotação em BNB indisponível ou antiga/);
  expect(screen.getByRole("button", { name: "Ponto de entrada no gráfico" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Revisar regra gráfica" })).toBeDisabled();
});
it("keeps an existing position intact, previews its actual cost and blocks replacement", async () => {
  io.settings.mockResolvedValue({
    strategy: { version: 2, config: { ...EMPTY_CONFIG, sizingMode: "fixo", buyAmount: 0.01 } },
    draft: null,
    bot: { armed: false, strat_state: { tokens: 10, costBnb: 0.012, accountingEstimated: true } },
  });
  show();
  await mark();
  expect(screen.getByText(/Posição atual do robô: 10 TEST/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Revisar regra gráfica" })).toBeDisabled();
  expect(io.save).not.toHaveBeenCalled();
});
it("closes the tool when switching wallets and isolates persisted draft points by user and wallet", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = () => (
    <QueryClientProvider client={client}>
      <ChartRuleLauncher token={token} symbol="TEST" />
    </QueryClientProvider>
  );
  const { rerender } = render(view());
  fireEvent.click(screen.getByRole("button", { name: "Criar regra pelo gráfico" }));
  await mark();
  await waitFor(() =>
    expect(
      localStorage.getItem(`cryptobot:chart-rule-draft:user-a:scope-a:${token.toLowerCase()}`),
    ).toContain("0.0009"),
  );
  io.selection = { ...io.selection, walletScope: "scope-b", name: "Carteira B" };
  rerender(view());
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Criar regra pelo gráfico" }));
  await waitFor(() =>
    expect(screen.getByRole("spinbutton", { name: "Valor da única compra (BNB)" })).toHaveValue(
      0.01,
    ),
  );
  expect(screen.getByRole("spinbutton", { name: "Entrada (BNB por token)" })).toHaveValue(null);
  expect(io.save).not.toHaveBeenCalled();
  expect(io.start).not.toHaveBeenCalled();
});
