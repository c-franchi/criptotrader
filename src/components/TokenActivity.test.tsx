import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ transfers: vi.fn(), market: vi.fn() }));
vi.mock("@/lib/transfers.functions", () => ({ getTransfers: mocks.transfers }));
vi.mock("@/lib/chain.functions", () => ({ getMarket: mocks.market }));
import { TokenActivity } from "./TokenActivity";
const token = `0x${"1".repeat(40)}`,
  pool = `0x${"2".repeat(40)}`,
  wallet = `0x${"3".repeat(40)}`;
const data = {
  transfers: [{ hash: "0xabc", block: 123, from: pool, to: wallet, amountRaw: "1250000" }],
  source: "rpc",
  holders: null,
  holdersNote: "",
  error: null,
  scannedBlocks: 1000,
  ranking: [
    {
      wallet,
      buys: 1,
      sells: 0,
      boughtRaw: "1250000",
      soldRaw: "0",
      volumeRaw: "1250000",
      trades: 1,
    },
  ],
  rankedTransfers: 1,
  fetchedAt: "2026-10-25T18:00:00Z",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("loads only on expansion, shows transfer classification and restores the ranking tab", async () => {
  mocks.transfers.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TokenActivity token={token} symbol="TEST" decimals={6} pool={pool} />
    </QueryClientProvider>,
  );
  expect(mocks.transfers).not.toHaveBeenCalled();
  expect(mocks.market).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Compras, vendas e traders · TEST"));
  expect(await screen.findByText("Compra provável")).toBeTruthy();
  expect(screen.getByText("1,25 TEST")).toBeTruthy();
  expect(mocks.transfers).toHaveBeenCalledWith({ data: { address: token, pool } });
  fireEvent.click(screen.getByRole("tab", { name: "Ranking de traders" }));
  expect(screen.getByText(/Compras prováveis: 1/)).toBeTruthy();
  expect(screen.getByText(/não é um ranking de rentabilidade/)).toBeTruthy();
  client.clear();
});

it("does not carry another token's open state or late transfer response into the next asset", async () => {
  let resolve!: (value: typeof data) => void;
  mocks.transfers.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const client = new QueryClient();
  const view = (address: string, symbol: string) => (
    <QueryClientProvider client={client}>
      <TokenActivity token={address} symbol={symbol} decimals={6} pool={pool} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(token, "TEST"));
  fireEvent.click(screen.getByText("Compras, vendas e traders · TEST"));
  await waitFor(() => expect(mocks.transfers).toHaveBeenCalledOnce());
  rerender(view(`0x${"4".repeat(40)}`, "OUTRO"));
  await act(async () => {
    resolve(data);
  });
  expect(screen.queryByText("Compra provável")).toBeNull();
  expect(screen.getByText("Compras, vendas e traders · OUTRO").closest("details")?.open).toBe(
    false,
  );
  expect(mocks.transfers).toHaveBeenCalledOnce();
  client.clear();
});

it("keeps dated saved activity visible when a refresh fails", async () => {
  mocks.transfers.mockResolvedValue({
    ...data,
    error:
      "Não foi possível atualizar as movimentações. Exibindo a última consulta salva, com a data original.",
  });
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <TokenActivity token={token} symbol="TEST" decimals={6} pool={pool} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("Compras, vendas e traders · TEST"));
  expect(await screen.findByText(/Exibindo a última consulta salva/)).toBeTruthy();
  expect(screen.getByText("Compra provável")).toBeTruthy();
  client.clear();
});
