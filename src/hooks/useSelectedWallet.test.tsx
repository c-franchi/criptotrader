import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: { id: "u" } as { id: string } | null,
  wallets: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      label: "Principal",
      address: "0x1111111111111111111111111111111111111111",
      created_at: "2026-01-01",
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      label: "Reserva",
      address: "0x2222222222222222222222222222222222222222",
      created_at: "2026-01-01",
    },
  ],
}));
vi.mock("./useAuth", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("./useSavedWallets", () => ({
  useSavedWallets: () => ({ wallets: state.wallets, ready: true }),
}));
import { SelectedWalletProvider, useSelectedWallet } from "./useSelectedWallet";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";
function Probe() {
  const { walletScope, selectWallet } = useSelectedWallet();
  return (
    <>
      <output>{walletScope}</output>
      <button onClick={() => selectWallet(state.wallets[0]!.id)}>A</button>
      <button onClick={() => selectWallet(state.wallets[1]!.id)}>B</button>
    </>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  state.user = { id: "u" };
});
it("restores and changes the portfolio without updating bots or sharing selection across users", async () => {
  localStorage.setItem("cryptobot:wallet:u", state.wallets[0]!.id);
  const { rerender } = render(
    <SelectedWalletProvider>
      <Probe />
    </SelectedWalletProvider>,
  );
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe(state.wallets[0]!.id));
  fireEvent.click(screen.getByText("B"));
  expect(screen.getByRole("status").textContent).toBe(state.wallets[1]!.id);
  expect(localStorage.getItem("cryptobot:wallet:u")).toBe(state.wallets[1]!.id);
  state.user = { id: "another-user" };
  rerender(
    <SelectedWalletProvider>
      <Probe />
    </SelectedWalletProvider>,
  );
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe(LEGACY_WALLET_SCOPE));
});
