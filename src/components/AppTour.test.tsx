import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppTour } from "./AppTour";
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("walks through the tools without navigation or trading until the user chooses an action", () => {
  const close = vi.fn();
  render(<AppTour open onOpenChange={close} />);
  expect(screen.getByRole("heading", { name: "Comece pelo painel" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  expect(screen.getByRole("heading", { name: "Organize suas carteiras" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
  expect(screen.getByRole("heading", { name: "Comece pelo painel" })).toBeTruthy();
  for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  expect(screen.getByText(/Tour guiado\./)).toBeTruthy();
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Concluir tour" }));
  expect(close).toHaveBeenCalledWith(false);
});
it("opens only the chosen tool and restarts from the beginning when reopened through the menu", () => {
  const close = vi.fn();
  const view = render(<AppTour open onOpenChange={close} />);
  fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  fireEvent.click(screen.getByRole("button", { name: "Abrir carteiras" }));
  expect(navigate).toHaveBeenCalledWith({ to: "/carteiras" });
  expect(close).toHaveBeenCalledWith(false);
  view.rerender(<AppTour open={false} onOpenChange={close} />);
  view.rerender(<AppTour open onOpenChange={close} />);
  expect(screen.getByRole("heading", { name: "Comece pelo painel" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(navigate).toHaveBeenCalledTimes(1);
});
