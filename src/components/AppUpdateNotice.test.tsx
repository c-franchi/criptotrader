import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppUpdateNotice } from "./AppUpdateNotice";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("detects a new deployment without reloading the user's form", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ version: "new-release" }) });
  vi.stubGlobal("fetch", fetcher);
  render(<AppUpdateNotice />);
  await screen.findByText("Nova versão disponível");
  expect(screen.getByRole("button", { name: "Atualizar agora" })).toBeTruthy();
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
});
it("rechecks when returning to an installed app", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ version: "development" }) });
  vi.stubGlobal("fetch", fetcher);
  render(<AppUpdateNotice />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Verificar atualização do app" })).toBeEnabled(),
  );
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ version: "next" }) });
  fireEvent.focus(window);
  await screen.findByText("Nova versão disponível");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
