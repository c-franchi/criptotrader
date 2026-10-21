import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, it, expect } from "vitest";
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
