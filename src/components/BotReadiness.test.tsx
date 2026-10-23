import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { ready } = vi.hoisted(() => ({ ready: vi.fn() }));
vi.mock("@/lib/guidedBot.functions", () => ({ getBotReadiness: ready }));
vi.mock("./AppShell", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
import { BotReadiness } from "./BotReadiness";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("routes each blocker to its own correction and keeps a short balance readable", async () => {
  ready.mockResolvedValue({
    ready: false,
    errors: ["Liquidez insuficiente", "Saldo insuficiente"],
    issues: [
      { message: "Liquidez insuficiente", action: "liquidity" },
      { message: "Saldo insuficiente", action: "fund" },
    ],
    warnings: [],
    available: "0.003986223422394976",
    feeBnb: null,
    exchangeCostBnb: null,
  });
  const configure = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BotReadiness walletScope="s" token="t" onConfigure={configure} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Revisar liquidez" }));
  expect(configure).toHaveBeenLastCalledWith("liquidity");
  fireEvent.click(screen.getByRole("button", { name: "Ver saldo e adicionar BNB" }));
  expect(configure).toHaveBeenLastCalledWith("fund");
  expect(screen.getByText("0,00398622 BNB")).toBeTruthy();
});
