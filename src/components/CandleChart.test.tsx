import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { CandleChart } from "./CandleChart";
import type { Candle } from "@/lib/marketStats";
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

function measurementChart() {
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
  return svg;
}
function pointer(
  svg: Element,
  type: string,
  x: number,
  y: number,
  button = 0,
  buttons = 1,
  pointerType = "mouse",
  pointerId = 1,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
    buttons,
  });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
  });
  fireEvent(svg, event);
}
it.each([
  [0, 1],
  [2, 2],
  [1, 4],
])("pans with mouse button %i while preserving the completed measurement", (button, buttons) => {
  const svg = measurementChart();
  fireEvent.click(svg, { clientX: 200, clientY: 120 });
  fireEvent.click(svg, { clientX: 300, clientY: 80 });
  const result = screen.getByText(/Medição concluída:/).textContent;
  const before = svg.querySelector('circle[r="5"]')?.getAttribute("cx");
  pointer(svg, "pointerdown", 300, 150, button, buttons);
  pointer(svg, "pointermove", 400, 150, button, buttons);
  pointer(svg, "pointerup", 400, 150, button, 0);
  // Browsers can dispatch a click after dragging. It must never reset the measurement.
  fireEvent.click(svg, { clientX: 400, clientY: 150, button });
  expect(screen.getByText(/Medição concluída:/).textContent).toBe(result);
  expect(svg.querySelector('circle[r="5"]')?.getAttribute("cx")).not.toBe(before);
  expect(screen.getByRole("button", { name: "Voltar ao tempo real" })).toBeTruthy();
  expect(fireEvent.contextMenu(svg)).toBe(false);
  // A fresh primary click must still start another measurement.
  pointer(svg, "pointerdown", 250, 130);
  pointer(svg, "pointerup", 250, 130, 0, 0);
  fireEvent.click(svg, { clientX: 250, clientY: 130 });
  expect(screen.getByText("Ponto 1 marcado. Toque ou clique no segundo ponto.")).toBeTruthy();
});
it("keeps the first point during a touch drag and accepts a second tap", () => {
  const svg = measurementChart();
  fireEvent.click(svg, { clientX: 200, clientY: 120 });
  pointer(svg, "pointerdown", 300, 150, 0, 1, "touch");
  // Small individual moves must accumulate into a drag rather than a tap.
  for (const x of [304, 308, 312]) pointer(svg, "pointermove", x, 150, 0, 1, "touch");
  pointer(svg, "pointerup", 312, 150, 0, 0, "touch");
  fireEvent.click(svg, { clientX: 312, clientY: 150 });
  expect(screen.getByText("Ponto 1 marcado. Toque ou clique no segundo ponto.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Voltar ao tempo real" })).toBeTruthy();
  pointer(svg, "pointerdown", 250, 100, 0, 1, "touch");
  pointer(svg, "pointerup", 250, 100, 0, 0, "touch");
  fireEvent.click(svg, { clientX: 250, clientY: 100 });
  expect(screen.getByText(/Medição concluída:/)).toBeTruthy();
});
it("does not mark after a canceled pointer or a two-finger zoom", () => {
  const svg = measurementChart();
  pointer(svg, "pointerdown", 200, 100, 0, 1, "touch");
  pointer(svg, "pointercancel", 200, 100, 0, 0, "touch");
  fireEvent.click(svg, { clientX: 200, clientY: 100 });
  expect(screen.queryByText("Ponto 1 marcado. Toque ou clique no segundo ponto.")).toBeNull();
  pointer(svg, "pointerdown", 200, 100, 0, 1, "touch", 1);
  pointer(svg, "pointerdown", 300, 100, 0, 1, "touch", 2);
  pointer(svg, "pointermove", 350, 100, 0, 1, "touch", 2);
  pointer(svg, "pointerup", 350, 100, 0, 0, "touch", 2);
  pointer(svg, "pointerup", 200, 100, 0, 0, "touch", 1);
  fireEvent.click(svg, { clientX: 200, clientY: 100 });
  expect(screen.queryByText("Ponto 1 marcado. Toque ou clique no segundo ponto.")).toBeNull();
});

it("updates a separate current-price line without modifying OHLC or closed averages", () => {
  const before = JSON.stringify(candles);
  const view = render(
    <CandleChart candles={candles} now={9000000} liveQuote={{ price: 102, at: 9000000 }} />,
  );
  expect(screen.getByLabelText(/Cotação atual independente das velas: US\$ 102,00/)).toBeTruthy();
  view.rerender(
    <CandleChart candles={candles} now={9003000} liveQuote={{ price: 103, at: 9003000 }} />,
  );
  expect(screen.getByLabelText(/Cotação atual independente das velas: US\$ 103,00/)).toBeTruthy();
  expect(JSON.stringify(candles)).toBe(before);
  view.rerender(
    <CandleChart candles={candles} now={9020000} liveQuote={{ price: 103, at: 9003000 }} />,
  );
  expect(screen.queryByLabelText(/Cotação atual independente/)).toBeNull();
});
