import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { finish } = vi.hoisted(() => ({ finish: vi.fn() }));
vi.mock("@/lib/finishAutomation", () => ({ finishAutomationKeepingAssets: finish }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { FinishAutomationButton } from "./FinishAutomationButton";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("requires confirmation that the automatic stop and targets will stop before retaining assets", async () => {
  finish.mockResolvedValue({ auditRecorded: true });
  const done = vi.fn().mockResolvedValue(undefined);
  render(
    <FinishAutomationButton
      botId="b"
      userId="u"
      walletScope="s"
      symbol="TEST"
      armed
      onDone={done}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Finalizar automação · manter moedas" }));
  expect(screen.getByText(/stop loss automáticos deixam de atuar/)).toBeTruthy();
  expect(finish).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar · manter moedas" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(finish).toHaveBeenCalledWith({}, "u", "s", "b");
});
