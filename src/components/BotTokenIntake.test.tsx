import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { BotTokenIntake, BotTokenIntakeBoundary } from "./BotTokenIntake";
import { initialSellDraftKey } from "@/lib/initialSellPlan";

vi.mock("./AppShell", () => ({
  Panel: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

const token = "0x" + "a".repeat(40);
const walletAddress = "0x" + "b".repeat(40);
const makeProps = () => ({
  userId: "owner",
  walletScope: "wallet-a",
  walletName: "Carteira teste",
  walletAddress,
  bnb: "0.0085",
  holdings: [{ address: token, symbol: "GTE", amount: "123.456789" }],
  token,
  symbol: "GTE",
  botArmed: false,
  botPositionTokens: 0,
  onSelectToken: vi.fn(),
  onRefresh: vi.fn(),
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("opens the robot with an empty sale price without crashing its route", () => {
  render(
    <BotTokenIntakeBoundary>
      <BotTokenIntake {...makeProps()} />
    </BotTokenIntakeBoundary>,
  );
  expect(screen.getByRole("region", { name: /Ativos e venda inicial/ })).toBeTruthy();
  expect(screen.getByText(/Saldo on-chain de GTE/)).toBeTruthy();
  expect((screen.getByRole("textbox", { name: /Preço mínimo BNB por token/ }) as HTMLInputElement).value).toBe("");
  expect((screen.getByRole("button", { name: /Guardar plano de venda/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText(/painel de tokens não pôde ser exibido/)).toBeNull();
});

it("keeps an external token sale as a local, non-executable plan", () => {
  render(<BotTokenIntake {...makeProps()} />);
  fireEvent.change(screen.getByRole("textbox", { name: /Preço mínimo BNB por token/ }), {
    target: { value: "0.00000001" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Guardar plano de venda/ }));
  const key = initialSellDraftKey("owner", "wallet-a", walletAddress, token);
  const saved = JSON.parse(localStorage.getItem(key) || "null");
  expect(saved).toMatchObject({
    mode: "sell_only",
    sharePct: 100,
    minPriceBnb: "0.00000001",
    walletAddress,
    tokenAddress: token,
  });
  expect(saved).not.toHaveProperty("armed");
  expect(saved).not.toHaveProperty("execute");
});

it("shows a safe empty state without tokens, and does not render an executable sale control", () => {
  render(<BotTokenIntake {...makeProps()} holdings={[]} />);
  expect(screen.getByText(/Nenhum saldo positivo confirmado/)).toBeTruthy();
  expect(screen.getByText(/Saldo de GTE ainda não confirmado/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Executar venda|Vender agora|Ativar venda/ })).toBeNull();
});
