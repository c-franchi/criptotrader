import { beforeEach, expect, it, vi } from "vitest";
import { returnBotAssets } from "./botWithdrawal.server";
const mocks = vi.hoisted(() => ({ contract: vi.fn(), native: vi.fn(), settle: vi.fn() }));
vi.mock("./submission.server", () => ({
  contractTransaction: mocks.contract,
  submitTransaction: mocks.native,
  settleSubmission: mocks.settle,
}));
const from = "0x1111111111111111111111111111111111111111" as const,
  to = "0x2222222222222222222222222222222222222222" as const;
const a = "0x3333333333333333333333333333333333333333" as const,
  b = "0x4444444444444444444444444444444444444444" as const;
function fixture() {
  return {
    admin: {},
    wallet: {},
    userId: "user",
    owner: "mutex",
    scope: "scope",
    from,
    to,
    tokens: [
      { address: a, symbol: "AAA", decimals: 18 },
      { address: b, symbol: "BBB", decimals: 18 },
    ],
    keepBnb: 10n,
    pub: {
      readContract: vi.fn(async () => 100n),
      getGasPrice: vi.fn(async () => 1n),
      getBalance: vi.fn(async () => 1000000n),
      estimateContractGas: vi.fn(async () => 100n),
      estimateGas: vi.fn(async () => 21n),
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.contract.mockImplementation(async (o) => ({
    id: "token",
    hash: o.to,
    receipt: { status: "success" },
  }));
  mocks.native.mockResolvedValue({
    id: "bnb",
    hash: "native-hash",
    receipt: { status: "success" },
  });
  mocks.settle.mockResolvedValue(undefined);
});
it("confirms every token before sending BNB last and retains the selected reserve", async () => {
  const f = fixture(),
    result = await returnBotAssets(f);
  expect(result.status).toBe("completed");
  expect(result.hashes).toEqual([a, b, "native-hash"]);
  expect(mocks.contract.mock.invocationCallOrder[1]).toBeLessThan(
    mocks.native.mock.invocationCallOrder[0]!,
  );
  expect(mocks.settle).toHaveBeenCalledTimes(3);
  expect(mocks.native).toHaveBeenCalledWith(
    expect.objectContaining({
      value: 999948n,
      intent: expect.objectContaining({ minimumRemainingBnbRaw: "10" }),
    }),
  );
});
it("selecting one token never sends another or native BNB and ignores unrelated unread contracts", async () => {
  const f = fixture();
  f.pub.readContract.mockImplementation(async (o?: unknown) => {
    if ((o as { address: string }).address === b) throw new Error("unread");
    return 100n;
  });
  const result = await returnBotAssets({ ...f, assets: [a] });
  expect(result.hashes).toEqual([a]);
  expect(mocks.contract).toHaveBeenCalledTimes(1);
  expect(mocks.native).not.toHaveBeenCalled();
});
it("native-only withdrawal leaves estimated gas to retrieve the tokens still held", async () => {
  const f = fixture();
  await returnBotAssets({ ...f, assets: ["BNB"] });
  expect(mocks.contract).not.toHaveBeenCalled();
  expect(mocks.native).toHaveBeenCalledWith(
    expect.objectContaining({
      value: 999558n,
      intent: expect.objectContaining({ minimumRemainingBnbRaw: "400" }),
    }),
  );
});
it("a pending token stops the sequence without sending BNB or the next token", async () => {
  mocks.contract.mockResolvedValueOnce({ id: "pending", hash: "pending-hash", receipt: null });
  const result = await returnBotAssets(fixture());
  expect(result).toMatchObject({ status: "pending", hashes: ["pending-hash"] });
  expect(mocks.contract).toHaveBeenCalledTimes(1);
  expect(mocks.native).not.toHaveBeenCalled();
  expect(mocks.settle).not.toHaveBeenCalled();
});
it("a later failure preserves earlier hashes and never drains BNB", async () => {
  mocks.contract
    .mockResolvedValueOnce({ id: "first", hash: a, receipt: { status: "success" } })
    .mockRejectedValueOnce(new Error("before broadcast"));
  const result = await returnBotAssets(fixture());
  expect(result).toMatchObject({ status: "partial", hashes: [a] });
  expect(mocks.native).not.toHaveBeenCalled();
});
it("unread balances, failed estimates or insufficient gas prevent any broadcast during all-assets preflight", async () => {
  for (const kind of ["read", "estimate", "balance"]) {
    const f = fixture();
    if (kind === "read") f.pub.readContract.mockRejectedValue(new Error("RPC"));
    if (kind === "estimate") f.pub.estimateContractGas.mockRejectedValue(new Error("revert"));
    if (kind === "balance") f.pub.getBalance.mockResolvedValue(1n);
    await expect(returnBotAssets(f)).rejects.toThrow();
  }
  expect(mocks.contract).not.toHaveBeenCalled();
  expect(mocks.native).not.toHaveBeenCalled();
});
it("does not invent decimals or transfer an asset whose metadata could not be established", async () => {
  const f = fixture();
  await expect(
    returnBotAssets({
      ...f,
      tokens: [{ ...f.tokens[0]!, metadataUnavailable: true }],
      assets: [a],
    }),
  ).rejects.toThrow("metadados indisponíveis");
  expect(mocks.contract).not.toHaveBeenCalled();
});
