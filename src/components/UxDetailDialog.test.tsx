import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import { Coins } from "lucide-react";
import { UxActionTile, UxDetailDialog } from "./UxDetailDialog";

function Preview() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p>Status do robô: Pausado</p>
      <UxActionTile
        label="Editar valores"
        description="Configuração financeira"
        icon={Coins}
        onClick={() => setOpen(true)}
      />
      <UxDetailDialog open={open} onOpenChange={setOpen} title="Editar valores" icon={Coins}>
        <label htmlFor="limit">Valor por compra (BNB)</label>
        <input id="limit" defaultValue="0.005" />
      </UxDetailDialog>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows only the summary and one clear edit action until the modal opens", () => {
  render(<Preview />);
  expect(screen.getByText("Status do robô: Pausado")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByLabelText("Valor por compra (BNB)")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Editar valores/ }));
  const dialog = screen.getByRole("dialog", { name: "Editar valores" });
  expect(within(dialog).getByLabelText("Valor por compra (BNB)")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("does not run action callback when its tile is disabled", () => {
  const action = vi.fn();
  render(<UxActionTile label="Ativar robô" icon={Coins} onClick={action} disabled />);
  fireEvent.click(screen.getByRole("button", { name: "Ativar robô" }));
  expect(action).not.toHaveBeenCalled();
});

it("closes with Escape and restores focus to the action that opened it", async () => {
  render(<Preview />);
  const trigger = screen.getByRole("button", { name: /Editar valores/ });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Editar valores" });
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(dialog).toHaveAccessibleDescription(
    "Consulte os detalhes e use Fechar para voltar à tela anterior.",
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("offers a named close control without submitting the form", () => {
  const submit = vi.fn();
  render(
    <UxDetailDialog open onOpenChange={() => {}} title="Proteções">
      <form onSubmit={submit}>
        <input aria-label="Limite" />
      </form>
    </UxDetailDialog>,
  );
  const close = screen.getByRole("button", { name: "Fechar modal" });
  expect(close).toHaveAttribute("type", "button");
  fireEvent.click(close);
  expect(submit).not.toHaveBeenCalled();
});
