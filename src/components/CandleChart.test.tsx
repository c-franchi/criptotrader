import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { CandleChart } from "./CandleChart";
import type { Candle } from "@/lib/backtest";
const candles: Candle[] = Array.from({ length: 30 }, (_, i) => [i * 300, 100, 101, 99, 100, 10]);
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("saves display preferences and exposes overlays and RSI", () => {
  render(<CandleChart candles={candles} now={9000000} />);
  fireEvent.change(screen.getByLabelText("Altura do gráfico"), { target: { value: "560" } });
  fireEvent.change(screen.getByLabelText("Visualização do gráfico"), { target: { value: "line" } });
  fireEvent.click(screen.getByRole("button", { name: /Indicadores técnicos/ }));
  expect(screen.getByRole("img", { name: "RSI 14, níveis 30 e 70" })).toBeTruthy();
  const saved = JSON.parse(localStorage.getItem("cryptobot:chart-view")!);
  expect(saved.height).toBe(560);
  expect(saved.mode).toBe("line");
  expect(saved.technical).toBe(true);
});
it("adds and removes manual support without changing candles", () => {
  render(<CandleChart candles={candles} now={9000000} />);
  fireEvent.change(screen.getByLabelText("Preço da marcação"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Suporte" }));
  expect(screen.getByRole("button", { name: "Excluir marcação 1" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Limpar marcações" }));
  expect(screen.queryByRole("button", { name: "Excluir marcação 1" })).toBeNull();
  expect(candles).toHaveLength(30);
});

it("draws two points even in a time range without candles and keeps them expanded", () => {
  render(<CandleChart candles={candles} now={9000000} />);
  const svg = screen.getByRole("img", {
    name: "Velas OHLCV, escala de preços e médias SMA do robô",
  });
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 760,
    height: 396,
    right: 760,
    bottom: 396,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.change(screen.getByLabelText("Ferramenta do gráfico"), {
    target: { value: "measure" },
  });
  fireEvent.click(svg, { clientX: 200, clientY: 120 });
  expect(screen.getByText("Ponto 1 marcado. Toque ou clique no segundo ponto.")).toBeTruthy();
  fireEvent.click(svg, { clientX: 300, clientY: 80 });
  expect(screen.getByText(/Medição concluída:/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ampliar gráfico" }));
  expect(screen.getByRole("dialog", { name: "Gráfico ampliado" })).toBeTruthy();
  expect(screen.getByText(/Medição concluída:/)).toBeTruthy();
  expect(
    screen.getAllByRole("img", { name: "Velas OHLCV, escala de preços e médias SMA do robô" }),
  ).toHaveLength(1);
});
it("fits manual prices in the scale instead of hiding their lines", () => {
  render(<CandleChart candles={candles} now={9000000} />);
  fireEvent.change(screen.getByLabelText("Preço da marcação"), { target: { value: "10000" } });
  fireEvent.click(screen.getByRole("button", { name: "Suporte" }));
  expect(screen.getByText("Suporte · 10.000,00")).toBeTruthy();
});
