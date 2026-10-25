import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExecutionTimingPanel } from "./ExecutionTimingPanel";
const mocks = vi.hoisted(() => ({ metrics: vi.fn(), probe: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/executionTiming.functions", () => ({
  getExecutionTiming: mocks.metrics,
  testExecutionRpc: mocks.probe,
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ExecutionTimingPanel walletScope="scope-a" token="token-a" />
    </QueryClientProvider>,
  );
}
it("shows the timing caveat before expanding and never equates the poll interval with execution time", async () => {
  mocks.metrics.mockResolvedValue({
    armed: false,
    evaluatedAt: null,
    records: [],
    submissions: [],
  });
  show();
  expect(screen.getByText("Tempo: verificações ~2 s · execução não é instantânea")).toBeTruthy();
  expect(mocks.metrics).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Tempo: verificações ~2 s · execução não é instantânea"));
  expect(await screen.findByText(/Sem medições novas/)).toBeTruthy();
  expect(screen.getByText(/não no instante exato/)).toBeTruthy();
  expect(mocks.metrics).toHaveBeenCalledWith({
    data: { walletScope: "scope-a", token: "token-a" },
  });
});
it("uses journal confirmation after reconciliation without inventing a missing measured duration", async () => {
  mocks.metrics.mockResolvedValue({
    armed: true,
    evaluatedAt: "2026-10-25T00:00:00Z",
    records: [
      {
        runId: "run",
        botId: "bot",
        walletScope: "scope-a",
        token: "token-a",
        trigger: "schedule",
        phase: "pending",
        hash: "0xabc",
        elapsedMs: 1000,
        stages: { evaluationStarted: 1000, signalDetected: 1300, broadcastAttempted: 1600 },
      },
    ],
    submissions: [{ hash: "0xabc", status: "confirmed" }],
  });
  show();
  fireEvent.click(screen.getByText("Tempo: verificações ~2 s · execução não é instantânea"));
  expect(
    await screen.findByText(/Última operação medida: Confirmação da rede observada/),
  ).toBeTruthy();
  expect(screen.getAllByText("Não medido").length).toBeGreaterThan(0);
  expect(screen.getByText(/nenhum disparo WebSocket registrado/)).toBeTruthy();
  mocks.probe.mockResolvedValue({
    tests: [{ alias: "Principal", ok: true, durationMs: 120, at: "2026-10-25T00:00:00Z" }],
    recent: [],
  });
  fireEvent.click(screen.getByRole("button", { name: "Testar conexão com a BSC" }));
  await waitFor(() => expect(mocks.probe).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/RPC Principal: rede e bloco válidos/)).toBeTruthy();
});

it("updates one expanded panel repeatedly and stops polling when collapsed", async () => {
  vi.useFakeTimers();
  mocks.metrics.mockImplementation(async () => ({
    records: [],
    submissions: [],
    evaluatedAt: new Date(Date.now()).toISOString(),
    armed: false,
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ExecutionTimingPanel walletScope="test-wallet" token="test-token" />
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(mocks.metrics).not.toHaveBeenCalled();
  const details = container.querySelector("details")!;
  await act(async () => {
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await vi.advanceTimersByTimeAsync(1);
  });
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(screen.getAllByText(/Tempo: verificações/)).toHaveLength(1);
  }
  expect(mocks.metrics.mock.calls.length).toBeGreaterThanOrEqual(6);
  await act(async () => {
    details.open = false;
    fireEvent(details, new Event("toggle"));
    await vi.advanceTimersByTimeAsync(1);
  });
  const callsWhenClosed = mocks.metrics.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(mocks.metrics).toHaveBeenCalledTimes(callsWhenClosed);
  client.clear();
});
