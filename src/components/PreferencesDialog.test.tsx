import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CurrencyProvider, FiatValue } from "@/hooks/useCurrency";
import { PreferencesDialog } from "./PreferencesDialog";
import { CURRENCY_KEY } from "@/lib/fiat";
const { fx } = vi.hoisted(() => ({ fx: vi.fn() }));
vi.mock("@/lib/fx.functions", () => ({ getFxQuote: fx }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});
function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CurrencyProvider>
        <PreferencesDialog />
        <FiatValue bnb="0.004" />
      </CurrencyProvider>
    </QueryClientProvider>,
  );
}
it("changes all fiat estimates and restores the chosen currency on a new page", async () => {
  fx.mockImplementation(async () => ({ bnbUsd: 700, usdBrl: 5, usdEur: 0.9, at: Date.now() }));
  const view = show();
  await screen.findByText(/≈ R\$\s*14,00/);
  fireEvent.click(screen.getByRole("button", { name: "Preferências" }));
  fireEvent.change(screen.getByLabelText("Moeda de exibição"), { target: { value: "USD" } });
  expect(screen.getByText(/≈ US\$\s*2,80/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Moeda de exibição"), { target: { value: "EUR" } });
  expect(localStorage.getItem(CURRENCY_KEY)).toBe("EUR");
  view.unmount();
  show();
  await screen.findByText(/2,52/);
});
it("keeps estimates unavailable when a conversion request fails", async () => {
  fx.mockRejectedValue(new Error("offline"));
  show();
  expect(await screen.findByText("Conversão para BRL indisponível")).toBeTruthy();
  expect(screen.queryByText(/≈ R\$/)).toBeNull();
});
