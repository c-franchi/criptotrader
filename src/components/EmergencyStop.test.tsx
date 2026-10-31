import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { stop } = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => stop }));
vi.mock("@/lib/emergencyStop.functions", () => ({ stopAllBots: vi.fn() }));
import { EmergencyStop } from "./EmergencyStop";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EmergencyStop />
    </QueryClientProvider>,
  );
}
it("stops on the first click, disables repeat clicks and announces completion", async () => {
  let finish!: (value: unknown) => void;
  stop.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const listener = vi.fn();
  window.addEventListener("bots-emergency-stopped", listener);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Parar todos os bots" }));
  expect(screen.getByRole("button", { name: "Parando todos…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Parando todos…" }));
  expect(stop).toHaveBeenCalledTimes(1);
  finish({ stopped: 3, auditRecorded: true });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3 bot(s) parado(s)"));
  expect(listener).toHaveBeenCalledTimes(1);
  window.removeEventListener("bots-emergency-stopped", listener);
});
it("reports failure and allows retry without claiming bots stopped", async () => {
  stop.mockRejectedValue(new Error("offline"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Parar todos os bots" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível confirmar"),
  );
  expect(screen.getByRole("button", { name: "Parar todos os bots" })).toBeEnabled();
});
