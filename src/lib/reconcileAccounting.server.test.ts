import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trace: vi.fn(),
  receiptProof: vi.fn(),
  archive: { getTransactionReceipt: vi.fn() },
}));
vi.mock("./submission.server", () => ({
  verifiedNativeSaleProceeds: mocks.trace,
}));
vi.mock("./nativeSaleEvidence.server", () => ({
  proveSaleWithPublicRpc: mocks.receiptProof,
}));
vi.mock("viem", async () => ({
  ...(await vi.importActual("viem")),
  createPublicClient: () => mocks.archive,
}));
import { readAccountingProceeds, reconcileAccounting } from "./reconcileAccounting.server";

const EXPECTED = {
  token: "0x2222222222222222222222222222222222222222",
  pair: "0x3333333333333333333333333333333333333333",
  amountInRaw: "112378",
};
const HASH = ("0x" + "a".repeat(64)) as `0x${string}`;
const BLOCK = "0xabc";
const wallet = "0x1111111111111111111111111111111111111111";
const receipt = { status: "success", blockHash: BLOCK, blockNumber: 200n };
const pub = {
  getTransaction: async () => ({ from: wallet }),
  getTransactionReceipt: async () => receipt,
};

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("requires the exact expected token/pair/amount before attempting trace", async () => {
  mocks.receiptProof.mockResolvedValue({ raw: 100n });
  expect(await readAccountingProceeds(pub, HASH, wallet, BLOCK)).toBeNull();
  expect(mocks.trace).not.toHaveBeenCalled();
});

it("refuses WBNB receipt-only evidence even if the router emitted matching logs", async () => {
  mocks.receiptProof.mockResolvedValue({
    raw: 1000000000000000n,
    source: "pancake_v2_wbnb_receipt",
  });
  mocks.trace.mockResolvedValue(null);
  expect(await readAccountingProceeds(pub, HASH, wallet, BLOCK, EXPECTED)).toBeNull();
});

it("accepts the complete native trace but never an inconsistent WBNB receipt", async () => {
  mocks.trace.mockResolvedValue(100n);
  mocks.receiptProof.mockResolvedValue({ raw: 101n });
  expect(await readAccountingProceeds(pub, HASH, wallet, BLOCK, EXPECTED)).toBeNull();
  mocks.receiptProof.mockResolvedValue({ raw: 100n });
  expect(await readAccountingProceeds(pub, HASH, wallet, BLOCK, EXPECTED)).toEqual({
    raw: 100n,
    source: "execution_rpc_call_trace",
  });
});

it("checks the sale receipt again using the archive provider before accepting a trace", async () => {
  vi.stubEnv("BSC_TRACE_RPC_URL", "https://archive.example");
  mocks.trace.mockResolvedValueOnce(null).mockResolvedValueOnce(100n);
  mocks.receiptProof.mockResolvedValue(null);
  mocks.archive.getTransactionReceipt.mockResolvedValue(receipt);
  expect(await readAccountingProceeds(pub, HASH, wallet, BLOCK, EXPECTED)).toEqual({
    raw: 100n,
    source: "archive_rpc_call_trace",
  });
  expect(mocks.trace).toHaveBeenCalledTimes(2);
});

it("rejects an archive receipt for another canonical block", async () => {
  vi.stubEnv("BSC_TRACE_RPC_URL", "https://archive.example");
  mocks.trace.mockResolvedValue(null);
  mocks.receiptProof.mockResolvedValue(null);
  mocks.archive.getTransactionReceipt.mockResolvedValue({ ...receipt, blockHash: "0xwrong" });
  expect(await readAccountingProceeds(pub, HASH, wallet, BLOCK, EXPECTED)).toBeNull();
  expect(mocks.trace).toHaveBeenCalledTimes(1);
});

it("writes evidence before a scoped accounting update only after verified native trace", async () => {
  mocks.trace.mockResolvedValue(1000000000000000n);
  mocks.receiptProof.mockResolvedValue(null);
  const events: string[] = [];
  const eq = vi.fn().mockReturnThis();
  const is = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnThis();
  const maybeSingle = vi.fn(async () => ({ data: { id: "order-ok" }, error: null }));
  const update = vi.fn(() => {
    events.push("update");
    return { eq, is, select, maybeSingle };
  });
  const insert = vi.fn(async () => {
    events.push("audit");
    return { error: null };
  });
  const admin = { from: (table: string) => (table === "audit_log" ? { insert } : { update }) };
  const result = await reconcileAccounting(admin, pub, "owner", {
    id: "order-ok",
    tx_hash: HASH,
    wallet,
    wallet_scope: "scope",
    token: EXPECTED.token,
    pair_address: EXPECTED.pair,
    amount_in: EXPECTED.amountInRaw,
  });
  expect(result.confirmed).toBe(true);
  expect(events).toEqual(["audit", "update"]);
  expect(update).toHaveBeenCalledWith({
    actual_bnb_received: "0.001",
    accounting_status: "confirmado",
  });
  expect(eq).toHaveBeenCalledWith("user_id", "owner");
  expect(eq).toHaveBeenCalledWith("wallet_scope", "scope");
  expect(is).toHaveBeenCalledWith("actual_bnb_received", null);
});

it("does not write proceeds or claim profit when trace is unavailable", async () => {
  mocks.trace.mockResolvedValue(null);
  mocks.receiptProof.mockResolvedValue({ raw: 1000n });
  const admin = { from: vi.fn() };
  const result = await reconcileAccounting(admin, pub, "owner", {
    id: "order-unverified",
    tx_hash: HASH,
    wallet,
    wallet_scope: "scope",
    token: EXPECTED.token,
    pair_address: EXPECTED.pair,
    amount_in: EXPECTED.amountInRaw,
  });
  expect(result.confirmed).toBe(false);
  expect(admin.from).not.toHaveBeenCalled();
});

it("does not reconcile an order signed by a different wallet", async () => {
  const admin = { from: vi.fn() };
  const result = await reconcileAccounting(
    admin,
    { ...pub, getTransaction: async () => ({ from: "0xsomebodyelse" }) },
    "owner",
    {
      id: "wrong-wallet",
      tx_hash: HASH,
      wallet,
      wallet_scope: "scope",
      token: EXPECTED.token,
      pair_address: EXPECTED.pair,
      amount_in: EXPECTED.amountInRaw,
    },
  );
  expect(result.confirmed).toBe(false);
  expect(mocks.trace).not.toHaveBeenCalled();
  expect(admin.from).not.toHaveBeenCalled();
});
