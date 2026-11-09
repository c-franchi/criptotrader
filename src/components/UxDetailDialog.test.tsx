import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { Coins } from "lucide-react";
import { UxActionTile, UxDetailDialog } from "./UxDetailDialog";

function Preview() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p>Status do robô: Pausado</p>
      <UxActionTile label="Editar valores" description="Configuração financeira" icon={Coins} onClick={() => setOpen(true)} />
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
