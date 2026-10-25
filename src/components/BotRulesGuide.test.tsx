import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { BotRulesGuide } from "./BotRulesGuide";
import { StopLossDecision } from "./StopLossDecision";
afterEach(cleanup);
it("keeps current settings without changing them and only applies an explicit draft edit", () => {
  const change = vi.fn();
  render(
    <BotRulesGuide
      open
      onOpenChange={vi.fn()}
      fields={[
        { key: "dropPct", label: "Queda (%)", value: 5, onChange: change },
        { key: "reserve", label: "Reserva (BNB)", value: 0.001, onChange: change },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Manter valor" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Alterar" }));
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0.002" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Usar no formulário" }));
  expect(change).toHaveBeenCalledWith(0.002);
});
it("closing education never applies a draft change", () => {
  const change = vi.fn(),
    close = vi.fn();
  render(
    <BotRulesGuide
      open
      onOpenChange={close}
      fields={[{ key: "stopPct", label: "Stop", value: 8, onChange: change }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Alterar" }));
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar no formulário" }));
  expect(change).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledWith(false);
});
it("requires an explicit stop decision even for an existing disabled stop", () => {
  const confirm = vi.fn();
  function Host() {
    const [value, setValue] = useState(0);
    return (
      <StopLossDecision
        open
        onOpenChange={vi.fn()}
        value={value}
        onChange={setValue}
        onConfirm={confirm}
      />
    );
  }
  render(<Host />);
  const save = screen.getByRole("button", { name: "Confirmar escolha e salvar regras" });
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Manter tokens sem stop-loss fixo" }));
  expect(confirm).not.toHaveBeenCalled();
  expect(save).not.toBeDisabled();
  fireEvent.click(save);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Recuperação e ganhos nunca são garantidos/)).toBeTruthy();
});
it("reopening stop review requires a fresh choice and a valid percentage", () => {
  const props = { onOpenChange: vi.fn(), value: 8, onChange: vi.fn(), onConfirm: vi.fn() };
  const view = render(<StopLossDecision open {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Manter stop atual (8%)" }));
  expect(
    screen.getByRole("button", { name: "Confirmar escolha e salvar regras" }),
  ).not.toBeDisabled();
  view.rerender(<StopLossDecision open={false} {...props} />);
  view.rerender(<StopLossDecision open {...props} />);
  expect(screen.getByRole("button", { name: "Confirmar escolha e salvar regras" })).toBeDisabled();
});
