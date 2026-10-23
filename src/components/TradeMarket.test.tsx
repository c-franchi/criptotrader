import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TradeMarket } from "./TradeMarket";
import type { TokenInfo } from "@/lib/tokens";
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      pools: [{ supported: true, pairAddress: "0x3", priceUsd: "81692" }],
      fetchedAt: new Date().toISOString(),
      error: null,
    },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/chain.functions", () => ({ getTradingMarket: vi.fn() }));
vi.mock("@/hooks/useCandles", () => ({ useCandles: () => ({ data: [], refetch: vi.fn() }) }));
vi.mock("./CandleChart", () => ({
  CandleChart: ({ compact }: { compact: boolean }) => (
    <p>{compact ? "Gráfico com alternância simples" : "Gráfico"}</p>
  ),
}));
const token: TokenInfo = {
  address: "0x1111111111111111111111111111111111111111",
  symbol: "TEST",
  name: "Moeda teste",
  decimals: 18,
};
const other: TokenInfo = {
  ...token,
  address: "0x2222222222222222222222222222222222222222",
  symbol: "OUTRA",
};
afterEach(cleanup);
it("shows the selected token and hands the chosen side to the existing values flow", () => {
  const side = vi.fn(),
    select = vi.fn();
  render(
    <TradeMarket
      token={token}
      tokens={[token, other]}
      onSelect={select}
      onSide={side}
      disabled={false}
    />,
  );
  expect(screen.getByText("US$ 81.692,00")).toBeTruthy();
  expect(screen.getByText("Gráfico com alternância simples")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Comprar TEST" }));
  expect(side).toHaveBeenLastCalledWith("compra");
  fireEvent.click(screen.getByRole("button", { name: "Vender TEST" }));
  expect(side).toHaveBeenLastCalledWith("venda");
  fireEvent.change(screen.getByLabelText("Token para comprar ou vender"), {
    target: { value: other.address },
  });
  expect(select).toHaveBeenCalledWith(other.address);
});
it("prevents changing the token or side while an operation is in progress", () => {
  render(
    <TradeMarket
      token={token}
      tokens={[token, other]}
      onSelect={vi.fn()}
      onSide={vi.fn()}
      disabled
    />,
  );
  expect(screen.getByRole("button", { name: "Comprar TEST" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Vender TEST" })).toBeDisabled();
  expect(screen.getByLabelText("Token para comprar ou vender")).toBeDisabled();
});
