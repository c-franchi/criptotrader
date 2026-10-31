import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmergencyStop } from "./EmergencyStop";
const mock = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mock.stop }));
vi.mock("@/lib/emergencyStop.functions", () => ({ stopAllBots: {} }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("stops with one click, prevents duplicate requests and refreshes the bot screen", async () => {
  let finish!: (value: { stopped: number; auditSaved: boolean }) => void;
  mock.stop.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const refresh = vi.fn();
  window.addEventListener("bots-emergency-stopped", refresh);
  render(<EmergencyStop />);
  fireEvent.click(screen.getByRole("button", { name: "Parar todos os bots" }));
  const busy = screen.getByRole("button", { name: "Parando bots…" });
  expect(busy).toBeDisabled();
  fireEvent.click(busy);
  expect(mock.stop).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ stopped: 3, auditSaved: true });
  });
  expect(screen.getByRole("status")).toHaveTextContent(
    "3 robô(s) desligado(s) em todas as carteiras",
  );
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("button")).toBeEnabled();
  window.removeEventListener("bots-emergency-stopped", refresh);
});
it("shows an explicit failure with a retry instead of a success message", async () => {
  mock.stop.mockRejectedValue(new Error("offline"));
  render(<EmergencyStop />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Parada não confirmada");
  expect(screen.getByRole("button")).toBeEnabled();
});
