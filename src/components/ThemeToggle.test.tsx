import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_INIT, THEME_KEY } from "@/lib/theme";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
  document.documentElement.classList.remove("dark");
  document.head.querySelector('meta[name="theme-color"]')?.remove();
});
it("restores the saved light theme before paint and lets the user persist either appearance", () => {
  document.head.insertAdjacentHTML("beforeend", '<meta name="theme-color" content="#030816">');
  localStorage.setItem(THEME_KEY, "light");
  new Function(THEME_INIT)();
  expect(document.documentElement.dataset["theme"]).toBe("light");
  expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
    "#fafafa",
  );
  const view = render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Ativar tema escuro" }));
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  view.unmount();
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Ativar tema claro" }));
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
});
it("still changes appearance when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Ativar tema escuro" }));
  expect(document.documentElement.dataset["theme"]).toBe("dark");
});

it("defaults to light without overwriting an explicitly selected dark theme", () => {
  new Function(THEME_INIT)();
  expect(document.documentElement.dataset["theme"]).toBe("light");
  localStorage.setItem(THEME_KEY, "dark");
  new Function(THEME_INIT)();
  expect(document.documentElement.dataset["theme"]).toBe("dark");
});
