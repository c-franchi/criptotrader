import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  archive: { getChainId: vi.fn(), getTransactionReceipt: vi.fn() },
}));
vi.mock("./submission.server", () => ({ nativeProceeds: mocks.native }));
vi.mock("viem", async () => ({
  ...(await vi.importActual("viem")),
  createPublicClient: () => mocks.archive,
}));
import { readAccountingProceeds, reconcileAccounting } from "./reconcileAccounting.server";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it("uses an archive trace only after verifying its chain and matching block", async () => {
  vi.stubEnv("BSC_TRACE_RPC_URL", "https://archive.example");
  mocks.native.mockResolvedValueOnce(null).mockResolvedValueOnce(100n);
  mocks.archive.getChainId.mockResolvedValue(56);
  mocks.archive.getTransactionReceipt.mockResolvedValue({ status: "success", blockHash: "0xabc" });
  expect(await readAccountingProceeds({}, "0x1", "wallet", "0xabc")).toEqual({
    raw: 100n,
    source: "archive_rpc_call_trace",
  });
  mocks.native.mockResolvedValue(null);
  mocks.archive.getChainId.mockResolvedValue(1);
  expect(await readAccountingProceeds({}, "0x2", "wallet", "0xabc")).toBeNull();
  expect(mocks.native).toHaveBeenCalledTimes(3);
});
it("rejects an archive response for a different block", async () => {
  vi.stubEnv("BSC_TRACE_RPC_URL", "https://archive.example");
  mocks.native.mockResolvedValue(null);
  mocks.archive.getChainId.mockResolvedValue(56);
  mocks.archive.getTransactionReceipt.mockResolvedValue({
    status: "success",
    blockHash: "0xother",
  });
  expect(await readAccountingProceeds({}, "0x1", "wallet", "0xabc")).toBeNull();
  expect(mocks.native).toHaveBeenCalledTimes(1);
});
it("writes append-only evidence before a scoped accounting update and preserves recorded gas", async () => {
  mocks.native.mockResolvedValue(1000000000000000n);
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
  const pub = {
    getTransaction: async () => ({ from: "wallet" }),
    getTransactionReceipt: async () => ({ status: "success", blockHash: "0xabc" }),
  };
  const r = await reconcileAccounting(admin, pub, "owner", {
    id: "order-ok",
    tx_hash: "0x1",
    wallet: "wallet",
    wallet_scope: "scope",
  });
  expect(r.confirmed).toBe(true);
  expect(events).toEqual(["audit", "update"]);
  expect(update).toHaveBeenCalledWith({
    actual_bnb_received: "0.001",
    accounting_status: "confirmado",
  });
  expect(eq).toHaveBeenCalledWith("user_id", "owner");
  expect(eq).toHaveBeenCalledWith("wallet_scope", "scope");
  expect(is).toHaveBeenCalledWith("actual_bnb_received", null);
});
it("does not write or report zero proceeds when the provider has no trace", async () => {
  vi.stubEnv("BSC_TRACE_RPC_URL", "");
  mocks.native.mockResolvedValue(null);
  const admin = { from: vi.fn() };
  const pub = {
    getTransaction: async () => ({ from: "wallet" }),
    getTransactionReceipt: async () => ({ status: "success", blockHash: "0xabc" }),
  };
  expect(
    (
      await reconcileAccounting(admin, pub, "owner", {
        id: "order-missing",
        tx_hash: "0x2",
        wallet: "wallet",
        wallet_scope: "scope",
      })
    ).confirmed,
  ).toBe(false);
  expect(admin.from).not.toHaveBeenCalled();
});
it("rejects transactions sent by another wallet before tracing or writing", async () => {
  const admin = { from: vi.fn() };
  const pub = {
    getTransaction: async () => ({ from: "other" }),
    getTransactionReceipt: async () => ({ status: "success", blockHash: "0xabc" }),
  };
  expect(
    (
      await reconcileAccounting(admin, pub, "owner", {
        id: "wrong-wallet",
        tx_hash: "0x3",
        wallet: "wallet",
        wallet_scope: "scope",
      })
    ).confirmed,
  ).toBe(false);
  expect(mocks.native).not.toHaveBeenCalled();
  expect(admin.from).not.toHaveBeenCalled();
});
