/* eslint-disable @typescript-eslint/no-explicit-any */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ data: {} as any }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.data }) }));
vi.mock("@/hooks/useCurrency", () => ({ FiatValue: () => null }));
vi.mock("@/lib/guidedBot.functions", () => ({ getGuidedBotPerformance: vi.fn() }));
vi.mock("./ReconcileSaleButton", () => ({
  ReconcileSaleButton: () => <button>Conferir BNB recebido</button>,
}));
import { BotPerformancePanel } from "./BotPerformancePanel";
afterEach(cleanup);
it("shows a closed cycle's actual receipts and loss after gas", () => {
  state.data = {
    cycles: [
      {
        id: "sale",
        closedAt: "2026-01-02",
        buys: 2,
        invested: "1",
        received: "0.9",
        gas: "0.01",
        breakEven: "1.01",
        net: "-0.11",
        percent: "-11.00",
        complete: true,
        pendingHashes: [],
      },
    ],
  };
  render(<BotPerformancePanel token="token" walletScope="scope" />);
  expect(screen.getByText("Prejuízo líquido confirmado")).toBeTruthy();
  expect(screen.getByText("0,9 BNB")).toBeTruthy();
  expect(screen.getByText("-0,11 BNB")).toBeTruthy();
});
it("keeps an unconfirmed receipt and cycle result pending with a reconciliation action", () => {
  state.data = {
    cycles: [
      {
        id: "sale",
        closedAt: "2026-01-02",
        buys: 1,
        invested: "1",
        received: null,
        gas: "0.01",
        breakEven: "1.01",
        net: null,
        percent: null,
        complete: false,
        pendingHashes: ["0xhash"],
      },
    ],
  };
  render(<BotPerformancePanel token="token" walletScope="scope" />);
  expect(screen.getByText("Resultado pendente de apuração")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Conferir BNB recebido" })).toBeTruthy();
});

it("keeps gain unknown and displays the exact break-even while sale proceeds are missing", () => {
  state.data = {
    accountingTraceConfigured: false,
    cycles: [
      {
        id: "gte-sale",
        closedAt: "2026-11-06T03:08:17Z",
        buys: 1,
        invested: "0.005199212254810774",
        received: null,
        gas: "0.0000173077",
        breakEven: "0.005216519954810774",
        net: null,
        percent: null,
        complete: false,
        pendingHashes: ["0xabc"],
      },
    ],
  };
  render(<BotPerformancePanel token="gte" walletScope="scope" />);
  expect(screen.getByText("Resultado pendente de apuração")).toBeTruthy();
  expect(screen.getByText(/0,005216519955 BNB/)).toBeTruthy();
  expect(screen.queryByText("Lucro líquido confirmado")).toBeNull();
  expect(screen.getByText(/BSC_TRACE_RPC_URL/)).toBeTruthy();
});
