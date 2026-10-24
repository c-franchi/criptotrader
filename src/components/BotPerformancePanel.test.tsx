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
        net: "-0.11",
        percent: "-11.00",
        complete: true,
        pendingHashes: [],
      },
    ],
  };
  render(<BotPerformancePanel token="token" walletScope="scope" />);
  expect(screen.getByText("Operação encerrada · 2 compras")).toBeTruthy();
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
        net: null,
        percent: null,
        complete: false,
        pendingHashes: ["0xhash"],
      },
    ],
  };
  render(<BotPerformancePanel token="token" walletScope="scope" />);
  expect(screen.getByText(/resultado líquido aguarda/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Conferir BNB recebido" })).toBeTruthy();
});
