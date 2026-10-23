import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RobotVision } from "./RobotVision";
import { EMPTY_CONFIG } from "@/lib/strategy";
import { EMPTY_STATE } from "@/lib/autoStrategy";
const { market } = vi.hoisted(() => ({ market: vi.fn() }));
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
vi.mock("./CandleChart", () => ({ CandleChart: () => <p>Gráfico</p> }));
vi.mock("./OrderAudit", () => ({ OrderAudit: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(age = 0) {
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
  expect(screen.getByText(/preço a cada 3s · executor a cada 5s/)).toBeTruthy();
  expect(market).toHaveBeenCalledWith({
    data: { address: "0x1111111111111111111111111111111111111111" },
  });
});
it("does not label stale or historical prices as the current price", async () => {
  show(60000);
  await screen.findByText(/Cotação atual indisponível ou antiga/);
  expect(screen.queryByText(/Preço agora:/)).toBeNull();
});
