import { beforeEach, expect, it, vi } from "vitest";
import { encodeFunctionData } from "viem";
import { PANCAKE_V2_ROUTER, WBNB, routerAbi } from "./pancake";

const mocks = vi.hoisted(() => ({
  receiptProof: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("./nativeSaleEvidence.server", () => ({
  proveSaleWithPublicRpc: mocks.receiptProof,
}));
vi.mock("./reconcileAccounting.server", () => ({
  reconcileAccounting: mocks.reconcile,
}));
import { settleSubmission } from "./submission.server";
import { tickAccounting } from "./accountingWorker.server";

const HASH = ("0x" + "a".repeat(64)) as `0x${string}`;
const BLOCK = ("0x" + "b".repeat(64)) as `0x${string}`;
const WALLET = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const PAIR = "0x3333333333333333333333333333333333333333";

beforeEach(() => vi.resetAllMocks());

it("persists proven BNB proceeds and source in the atomic execution journal", async () => {
  mocks.receiptProof.mockResolvedValue({
    raw: 5200000000000000n,
    source: "pancake_v2_wbnb_receipt",
    evidence: { chainId: 56, blockHash: BLOCK, wbnbWithdrawalRaw: "5200000000000000" },
  });
  const rpc = vi.fn(async (_name: string, _params: unknown) => ({ error: null }));
  const admin = { rpc };
  const intent = {
    kind: "swap",
    side: "venda",
    wallet: WALLET,
    token: TOKEN,
    amountIn: "112378",
    quotedOut: "9999999999999999",
    order: {
      source: "robo",
      pair_address: PAIR,
      amount_in: "112378",
      token: TOKEN,
      wallet: WALLET,
      side: "venda",
    },
  };
  const receipt = {
    status: "success",
    transactionHash: HASH,
    from: WALLET,
    to: PANCAKE_V2_ROUTER,
    blockNumber: 200n,
    blockHash: BLOCK,
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
    logs: [],
  };
  const pub = {
    getChainId: async () => 56,
    getBlock: async () => ({ hash: BLOCK }),
    getTransaction: async () => ({
      hash: HASH,
      from: WALLET,
      to: PANCAKE_V2_ROUTER,
      value: 0n,
      input: encodeFunctionData({
        abi: routerAbi,
        functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
        args: [112378n, 1n, [TOKEN, WBNB], WALLET, 9999999999n],
      }),
    }),
    request: async () => ({
      type: "CALL",
      from: WALLET,
      to: PANCAKE_V2_ROUTER,
      value: "0x0",
      calls: [
        {
          type: "CALL",
          from: PANCAKE_V2_ROUTER,
          to: WALLET,
          value: "0x" + 5200000000000000n.toString(16),
        },
      ],
    }),
  };
  await settleSubmission(admin, pub, { id: "journal", intent, tx_hash: HASH }, receipt as never);
  const request = rpc.mock.calls[0]![1] as {
    p_order: { actual_bnb_received: string; accounting_status: string };
    p_receipt: { accountingEvidence: { receivedWei: string; source: string } };
  };
  expect(request.p_order.actual_bnb_received).toBe("0.0052");
  expect(request.p_order.accounting_status).toBe("confirmado");
  expect(request.p_receipt.accountingEvidence).toMatchObject({
    receivedWei: "5200000000000000",
    source: "execution_rpc_call_trace",
  });
  expect(JSON.stringify(request)).not.toContain("9999999999999999");
});

it("does not mark WBNB receipt events as wallet profit when native tracing is unavailable", async () => {
  mocks.receiptProof.mockResolvedValue({
    raw: 5200000000000000n,
    source: "pancake_v2_wbnb_receipt",
    evidence: { chainId: 56, blockHash: BLOCK },
  });
  const rpc = vi.fn(async (_name: string, _params: unknown) => ({ error: null }));
  const admin = { rpc };
  const receipt = {
    status: "success",
    transactionHash: HASH,
    from: WALLET,
    to: PANCAKE_V2_ROUTER,
    blockNumber: 200n,
    blockHash: BLOCK,
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
    logs: [],
  };
  await settleSubmission(
    admin,
    {
      getChainId: async () => 56,
      getBlock: async () => ({ hash: BLOCK }),
      getTransaction: async () => ({
        hash: HASH,
        from: WALLET,
        to: PANCAKE_V2_ROUTER,
        value: 0n,
        input: encodeFunctionData({
          abi: routerAbi,
          functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
          args: [112378n, 1n, [TOKEN, WBNB], WALLET, 9999999999n],
        }),
      }),
      request: async () => {
        throw new Error("debug_traceTransaction not supported");
      },
    },
    {
      id: "pending",
      tx_hash: HASH,
      intent: {
        kind: "swap",
        side: "venda",
        wallet: WALLET,
        token: TOKEN,
        amountIn: "112378",
        quotedOut: "5200000000000000",
        order: { pair_address: PAIR, amount_in: "112378", side: "venda" },
      },
    },
    receipt as never,
  );
  const params = rpc.mock.calls[0]?.[1] as {
    p_order: { actual_bnb_received: string | null; accounting_status: string };
    p_receipt: { accountingEvidence?: unknown };
  };
  expect(params.p_order.actual_bnb_received).toBeNull();
  expect(params.p_order.accounting_status).toBe("estimado");
  expect(params.p_receipt.accountingEvidence).toBeUndefined();
});

function dbForClaims() {
  const updates: Record<string, unknown>[] = [];
  const update = vi.fn((data: Record<string, unknown>) => {
    updates.push(data);
    const chain = {
      eq: () => chain,
      then: (done: (value: unknown) => unknown) => done({ error: null }),
    };
    return chain;
  });
  const upsert = vi.fn(async () => ({ error: null }));
  return {
    updates,
    upsert,
    admin: {
      rpc: async () => ({
        data: [{ order_id: "order-1", user_id: "user-1", attempts: 1 }],
        error: null,
      }),
      from: (table: string) => {
        if (table === "orders") {
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                id: "order-1",
                user_id: "user-1",
                tx_hash: HASH,
                wallet: WALLET,
                wallet_scope: "scope-1",
                token: TOKEN,
                pair_address: PAIR,
                amount_in: "112378",
                side: "venda",
                status: "confirmada",
                actual_bnb_received: null,
              },
              error: null,
            }),
          };
          return chain;
        }
        if (table === "accounting_worker_heartbeat") return { upsert };
        return { update };
      },
    },
  };
}

it("background worker reconciles a sale without a browser, then closes the durable queue", async () => {
  const { admin, updates, upsert } = dbForClaims();
  mocks.reconcile.mockResolvedValue({ confirmed: true, message: "ok" });
  const result = await tickAccounting(admin, {});
  expect(result).toEqual({ claimed: 1, verified: 1, pending: 0, errors: 0 });
  expect(mocks.reconcile).toHaveBeenCalledOnce();
  expect(updates[0]).toHaveProperty("resolved_at");
  expect(upsert).toHaveBeenCalledOnce();
});

it("unknown proceeds remain pending with retry, never recorded as realized gain", async () => {
  const { admin, updates } = dbForClaims();
  mocks.reconcile.mockResolvedValue({ confirmed: false, message: "no evidence" });
  const result = await tickAccounting(admin, {});
  expect(result).toMatchObject({ claimed: 1, verified: 0, pending: 1 });
  expect(updates[0]).not.toHaveProperty("resolved_at");
  expect(updates[0]).toHaveProperty("next_attempt_at");
});

it("retries a provider failure and resolves only after a later successful proof", async () => {
  const { admin, updates } = dbForClaims();
  mocks.reconcile.mockRejectedValueOnce(new Error("provider unavailable"));
  expect(await tickAccounting(admin, {})).toEqual({ claimed: 1, verified: 0, pending: 0, errors: 1 });
  expect(updates[0]).not.toHaveProperty("resolved_at");
  mocks.reconcile.mockResolvedValueOnce({ confirmed: true, message: "proof" });
  expect(await tickAccounting(admin, {})).toEqual({ claimed: 1, verified: 1, pending: 0, errors: 0 });
  expect(updates[1]).toHaveProperty("resolved_at");
});
