import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BudgetPercentageSelector } from "./BudgetPercentageSelector";

afterEach(cleanup);

it("updates the indicated percentage when the available balance changes", () => {
  const props = { available: "1", value: "0.5", onSelect: vi.fn() };
  const view = render(<BudgetPercentageSelector {...props} />);
  expect(screen.getByText("50% selecionado")).toBeVisible();
  view.rerender(<BudgetPercentageSelector {...props} available="2" />);
  expect(screen.getByText("25% selecionado")).toBeVisible();
  expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "false");
  expect(props.onSelect).not.toHaveBeenCalled();
});

it("does not imply a confirmed allocation when the balance is unavailable or zero", () => {
  const props = { available: null, value: "0.5", onSelect: vi.fn() };
  const view = render(<BudgetPercentageSelector {...props} />);
  expect(screen.getByText("Nenhuma porcentagem selecionada")).toBeVisible();
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  view.rerender(<BudgetPercentageSelector {...props} available="0" value="0" />);
  expect(screen.getByText("Nenhuma porcentagem selecionada")).toBeVisible();
  for (const button of screen.getAllByRole("button"))
    expect(button).toHaveAttribute("aria-pressed", "false");
});
