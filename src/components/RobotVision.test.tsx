import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RobotVision, robotLines } from "./RobotVision";
import { EMPTY_CONFIG } from "@/lib/strategy";
import { EMPTY_STATE } from "@/lib/autoStrategy";
const { market, chart } = vi.hoisted(() => ({ market: vi.fn(), chart: vi.fn() }));
vi.mock("@/lib/chain.functions", () => ({ getTradingMarket: market }));
vi.mock("@/hooks/useCandles", () => ({
  useCandles: () => ({
    data: Array.from({ length: 30 }, (_, i) => [
      (Math.floor(Date.now() / 300000) - 30 + i) * 300,
      100,
      101,
      99,
      100,
      1,
    ]),
  }),
}));
vi.mock("./CandleChart", () => ({
  CandleChart: (props: unknown) => {
    chart(props);
    return <p>Gráfico</p>;
  },
}));
vi.mock("./OrderAudit", () => ({ OrderAudit: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(age = 0, streamlined = false) {
  market.mockResolvedValue({
    fetchedAt: new Date(Date.now() - age).toISOString(),
    source: "on-chain · bloco 123",
    error: null,
    pools: [
      {
        pairAddress: "0x2222222222222222222222222222222222222222",
        supported: true,
        priceUsd: "98.50001",
        liquidityUsd: 100000,
      },
    ],
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RobotVision
        streamlined={streamlined}
        token="0x1111111111111111111111111111111111111111"
        symbol="TEST"
        cfg={{ ...EMPTY_CONFIG, entryType: "queda", dropPct: 1.5 }}
        state={EMPTY_STATE}
        mode="estrategia"
        grid={[]}
        orders={[]}
        armed
        evaluatedAt={new Date().toISOString()}
        serverAnalysis={{ at: new Date().toISOString(), reason: "Esperando", error: null }}
      />
    </QueryClientProvider>,
  );
}
it("explains the saved drop trigger and uses an actually observed quote time with nonzero distance", async () => {
  show();
  await screen.findByText(/Preço agora:/);
  expect(
    screen.getByText(/SMA 9\/21 são apenas indicadores visuais nesta estratégia/),
  ).toBeTruthy();
  expect(screen.getByText(/Distância do gatilho de compra: < 0,001%/)).toBeTruthy();
  expect(screen.getByText(/preço a cada 2s · executor programado a cada 2s/)).toBeTruthy();
  expect(market).toHaveBeenCalledWith({
    data: { address: "0x1111111111111111111111111111111111111111" },
  });
});
it("does not label stale or historical prices as the current price", async () => {
  show(60000);
  await screen.findByText(/Cotação atual indisponível ou antiga/);
  expect(screen.queryByText(/Preço agora:/)).toBeNull();
});

it("distinguishes the saved sale target from the current-price line even when preview is unavailable", async () => {
  market.mockResolvedValue({ fetchedAt: new Date().toISOString(), error: null, pools: [] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RobotVision
        token="0x1111111111111111111111111111111111111111"
        symbol="TEST"
        cfg={{ ...EMPTY_CONFIG, takeProfits: [{ pct: 3, sellPct: 100 }] }}
        state={{ ...EMPTY_STATE, tokens: 1, avgPriceUsd: 81661.64798828923 }}
        mode="estrategia"
        grid={[]}
        orders={[]}
        armed
        serverAnalysis={null}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("region", { name: "Alvo de venda salvo" })).toBeTruthy();
  expect(screen.getByText(/Próxima venda · US\$ 84.111,50/)).toBeTruthy();
  expect(screen.getByText(/A linha “Agora” é a cotação atual, não o alvo/)).toBeTruthy();
  expect(screen.getByText(/Alvo da estratégia salva; a execução não está confirmada/)).toBeTruthy();
});

it("keeps the market concise and lets the user expand its analysis", async () => {
  show(0, true);
  const toggle = await screen.findByRole("button", { name: "Análise e auditoria +" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Próxima compra")).toBeTruthy();
  expect(screen.getByText("Próxima venda")).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

it("shows the saved manual prices without moving the exit to cover token taxes", async () => {
  const { buildManualAutoConfig } = await import("@/lib/manualAuto");
  const c = buildManualAutoConfig(
    {
      capitalBnb: 0.01,
      entryMode: "price",
      entryValue: 100,
      exitMode: "price",
      exitValue: 101,
      stopLossPct: null,
      slippagePct: 1,
      buyTaxPct: 8,
      sellTaxPct: 8,
    },
    110,
    "11111111-1111-4111-8111-111111111111",
  );
  expect(robotLines(c, EMPTY_STATE, null)).toEqual([
    { price: 100, label: "Entrada manual escolhida", tone: "buy" },
    { price: 101, label: "Saída manual escolhida", tone: "sell" },
  ]);
  expect(
    robotLines(c, { ...EMPTY_STATE, tokens: 1, avgPriceUsd: 100 }, null).find(
      (l) => l.tone === "sell",
    )?.price,
  ).toBe(101);
  expect(robotLines(c, { ...EMPTY_STATE, manualRuleConsumedId: c.manualAuto!.id }, null)).toEqual(
    [],
  );
});

it("renders unchanged USD entry lines after a live BNB/asset quote change", async () => {
  const token = "0x1111111111111111111111111111111111111111";
  const snapshot = (usd: string, native: string) => ({
    fetchedAt: new Date().toISOString(),
    error: null,
    pools: [
      {
        supported: true,
        pairAddress: "0x2222222222222222222222222222222222222222",
        priceUsd: usd,
        priceNative: native,
        liquidityUsd: 100000,
      },
    ],
  });
  market.mockResolvedValue(snapshot("70000", "100"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RobotVision
        token={token}
        symbol="BTCB"
        cfg={{
          ...EMPTY_CONFIG,
          chartRule: {
            id: "11111111-1111-4111-8111-111111111111",
            unit: "BNB",
            priceAnchor: { unit: "USD", bnbUsd: 700 },
            version: 2,
            entryBnb: 68000 / 700,
            exitBnb: 72000 / 700,
            stopBnb: null,
            dexFeePct: 0.25,
            executionMarginPct: 1,
            gasBuyBnb: 0.00001,
            gasSellBnb: 0.00002,
            entries: [
              { priceBnb: 68000 / 700, amountBnb: "0.01" },
              { priceBnb: 62000 / 700, amountBnb: "0.01" },
            ],
            exits: [{ priceBnb: 72000 / 700, sharePct: 100 }],
          },
        }}
        state={EMPTY_STATE}
        mode="estrategia"
        grid={[]}
        orders={[]}
        armed
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(chart.mock.calls.at(-1)![0].levels).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Entrada 1", price: 68000 })]),
    ),
  );
  market.mockResolvedValue(snapshot("64000", String(64000 / 550)));
  await client.invalidateQueries({ queryKey: ["trading-market", token] });
  await waitFor(() =>
    expect(chart.mock.calls.at(-1)![0].levels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Entrada 1", price: 68000 }),
        expect.objectContaining({ label: "Entrada 2", price: 62000 }),
      ]),
    ),
  );
  expect(screen.getByText(/Pontos de compra e venda fixos em US\$/)).toBeVisible();
  client.clear();
});
