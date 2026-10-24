import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InstallApp } from "./InstallApp";
const mocks = vi.hoisted(() => ({ get: vi.fn(), run: vi.fn(), subscribe: vi.fn(() => () => {}) }));
vi.mock("@/lib/installPrompt", () => ({
  getInstallState: mocks.get,
  runInstall: mocks.run,
  subscribeInstall: mocks.subscribe,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
beforeEach(() => {
  mocks.get.mockReturnValue({
    canInstall: true,
    installed: false,
    standalone: false,
    prompting: false,
    accepted: false,
  });
  mocks.run.mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("offers the native install action first and keeps instructions collapsed", () => {
  render(<InstallApp />);
  expect(
    screen.getByText("Precisa de ajuda para instalar?").closest("details"),
  ).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Instalar CryptoBot" }));
  expect(mocks.run).toHaveBeenCalledOnce();
});
it("shows the installed state with a dashboard action instead of redundant installation steps", () => {
  mocks.get.mockReturnValue({
    canInstall: false,
    installed: true,
    standalone: true,
    prompting: false,
    accepted: false,
  });
  render(<InstallApp />);
  expect(screen.getByText("App aberto em modo instalado")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Abrir painel" })).toHaveAttribute("href", "/");
  expect(screen.queryByRole("button", { name: "Instalar CryptoBot" })).toBeNull();
  expect(screen.queryByText("Precisa de ajuda para instalar?")).toBeNull();
});
it("opens platform help when the browser cannot offer native installation, without pretending it installed", () => {
  mocks.get.mockReturnValue({
    canInstall: false,
    installed: false,
    standalone: false,
    prompting: false,
    accepted: false,
  });
  render(<InstallApp />);
  fireEvent.click(screen.getByRole("button", { name: "Instalar CryptoBot" }));
  expect(screen.getByText("Outras opções para instalar").closest("details")).toHaveAttribute(
    "open",
  );
  expect(mocks.run).not.toHaveBeenCalled();
  expect(screen.queryByText("Instalação confirmada pelo navegador")).toBeNull();
});
