import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { RemoveBotButton } from "./RemoveBotButton";
const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("@/lib/removeBot.functions", () => ({ removePausedBot: mocks.remove }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(armed = false) {
  const done = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RemoveBotButton
        botId="bot-a"
        walletScope="wallet-a"
        symbol="BTCB"
        armed={armed}
        onDone={done}
      />
    </QueryClientProvider>,
  );
  return done;
}
it("only removes the selected paused bot after explicit confirmation", async () => {
  mocks.remove.mockResolvedValue({ ok: true });
  const done = show();
  fireEvent.click(screen.getByRole("button", { name: "Remover robô" }));
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(screen.getByText(/saldo, estratégia e histórico/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(mocks.remove).toHaveBeenCalledWith({
    data: { botId: "bot-a", walletScope: "wallet-a", confirmation: "REMOVER ROBÔ" },
  });
});
it("offers no removal action for a running bot", () => {
  show(true);
  expect(screen.queryByRole("button", { name: "Remover robô" })).toBeNull();
});
it("canceling does not change any bot", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Remover robô" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(mocks.remove).not.toHaveBeenCalled();
});
