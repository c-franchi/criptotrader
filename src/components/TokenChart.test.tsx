import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  market: { data: undefined as unknown, isFetching: true, isError: false },
  candles: { data: undefined as unknown, isFetching: false, isError: false, failureCount: 0 },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => state.market }));
vi.mock("@/hooks/useCandles", () => ({ useCandles: () => state.candles }));
vi.mock("@/lib/chain.functions", () => ({ getMarket: vi.fn() }));
vi.mock("@/components/CandleChart", () => ({ CandleChart: () => <div>Velas recebidas</div> }));
import { TokenChart } from "./TokenChart";
afterEach(cleanup);
it("shows discovery instead of unavailable history while looking up a pool", () => {
  render(<TokenChart address="0x1" symbol="TEST" />);
  expect(screen.getByText("Localizando o mercado de TEST…")).toBeTruthy();
  expect(screen.queryByText("Histórico indisponível neste período.")).toBeNull();
});
it("explains retrying the history source", () => {
  state.market = {
    data: { pools: [{ supported: true, pairAddress: "0x2" }], fetchedAt: new Date().toISOString() },
    isFetching: false,
    isError: false,
  };
  state.candles = { data: undefined, isFetching: true, isError: false, failureCount: 1 };
  render(<TokenChart address="0x1" symbol="TEST" />);
  expect(screen.getByText("Carregando o gráfico de TEST…")).toBeTruthy();
  expect(screen.getByText(/A fonte demorou ou falhou/)).toBeTruthy();
});
it("keeps received candles on screen during refresh", () => {
  state.candles = {
    data: [[Math.floor(Date.now() / 1000), 1, 2, 1, 2]],
    isFetching: true,
    isError: false,
    failureCount: 0,
  };
  render(<TokenChart address="0x1" symbol="TEST" />);
  expect(screen.getByText("Velas recebidas")).toBeTruthy();
  expect(screen.getByText(/gráfico anterior deste ativo continua visível/)).toBeTruthy();
});
