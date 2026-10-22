import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ResetStrategiesButton } from "./ResetStrategiesButton";
const mocks = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock("@/lib/resetStrategies.functions", () => ({ resetStrategies: mocks.reset }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("requires explicit confirmation and defaults to only the selected wallet", async () => {
  mocks.reset.mockResolvedValue({ ok: true });
  const done = vi.fn();
  render(<ResetStrategiesButton walletScope="wallet-a" onDone={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Resetar estratégias" }));
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(screen.getByText(/não vende ativos nem remove travas/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Resetar estratégias desta carteira" }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(mocks.reset).toHaveBeenCalledWith({
    data: { walletScope: "wallet-a", allWallets: false, confirmation: "RESETAR ESTRATÉGIAS" },
  });
});
it("only includes all wallets when the user selects that option", async () => {
  mocks.reset.mockResolvedValue({ ok: true });
  render(<ResetStrategiesButton walletScope="wallet-a" onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Resetar estratégias" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Resetar todas as minhas estratégias" }));
  await waitFor(() =>
    expect(mocks.reset).toHaveBeenCalledWith({
      data: expect.objectContaining({ allWallets: true }),
    }),
  );
});
it("canceling never invokes a reset", () => {
  render(<ResetStrategiesButton walletScope="wallet-a" />);
  fireEvent.click(screen.getByRole("button", { name: "Resetar estratégias" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(mocks.reset).not.toHaveBeenCalled();
});
