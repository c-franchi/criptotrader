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
  const { walletScope, selectWallet, fundAddress, selectFundWallet, setWalletDirty } =
    useSelectedWallet();
  return (
    <>
      <output>{walletScope}</output>
      <span data-testid="fund">{fundAddress}</span>
      <button
        onClick={() =>
          selectFundWallet({
            address: "0x3333333333333333333333333333333333333333",
            label: "Pessoal A",
            scopes: [state.wallets[0]!.id],
            bot: false,
            personal: true,
            bnb: "1",
            assets: [],
            issues: [],
            capital: null,
          })
        }
      >
        Fund A
      </button>
      <button onClick={() => setWalletDirty(true)}>Dirty</button>
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

it("shares the selected physical wallet across pages and restores its matching robot scope", async () => {
  const view = render(
    <SelectedWalletProvider>
      <Probe />
    </SelectedWalletProvider>,
  );
  fireEvent.click(screen.getByText("Fund A"));
  expect(screen.getByTestId("fund").textContent).toBe("0x3333333333333333333333333333333333333333");
  expect(screen.getByRole("status").textContent).toBe(state.wallets[0]!.id);
  view.unmount();
  render(
    <SelectedWalletProvider>
      <Probe />
    </SelectedWalletProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("fund").textContent).toBe(
      "0x3333333333333333333333333333333333333333",
    ),
  );
});
it("keeps both portfolio and address unchanged when a dirty wallet switch is declined", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <SelectedWalletProvider>
      <Probe />
    </SelectedWalletProvider>,
  );
  fireEvent.click(screen.getByText("Dirty"));
  fireEvent.click(screen.getByText("Fund A"));
  expect(screen.getByRole("status").textContent).toBe(LEGACY_WALLET_SCOPE);
  expect(screen.getByTestId("fund").textContent).toBe("");
  vi.restoreAllMocks();
});
