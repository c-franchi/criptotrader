import { describe, expect, it, vi } from "vitest";
import { encodeEventTopics, encodeAbiParameters, parseAbi } from "viem";
import type { TransactionReceipt } from "viem";
import { nativeProceeds, settleSubmission, submitTransaction } from "./submission.server";
import { BeforeBroadcastError } from "./executionPhase";
import { EMPTY_STATE } from "./autoStrategy";
const userId = "u",
  owner = "lock",
  me = "0x1111111111111111111111111111111111111111",
  token = "0x2222222222222222222222222222222222222222";
function setup(failInsert = false) {
  const events: string[] = [];
  const botStatus = vi.fn(async () => ({
    data: { armed: true, archived_at: null },
    error: null as string | null,
  }));
  const botQuery = { select: () => botQuery, eq: () => botQuery, maybeSingle: botStatus };
  const admin = {
    rpc: vi.fn(async () => ({ error: null as string | null })),
    from: (table: string) =>
      table === "grid_bots"
        ? botQuery
        : {
            insert: vi.fn(async () => {
              events.push("persist");
              return { error: failInsert ? "offline" : null };
            }),
          },
  };
  const pub = {
    getGasPrice: vi.fn(async () => 1n),
    getBalance: vi.fn(async () => 1000000000000000000n),
    sendRawTransaction: vi.fn(async (_transaction: unknown) => {
      events.push("broadcast");
      throw new Error("response lost");
    }),
    waitForTransactionReceipt: vi.fn(async () => {
      throw new Error("timeout");
    }),
  };
  const wallet = {
    account: { address: me },
    prepareTransactionRequest: vi.fn(async () => ({ nonce: 4, gas: 21000n, gasPrice: 1n })),
    signTransaction: vi.fn(async () => "0x1234" as const),
  };
  return {
    events,
    botStatus,
    admin,
    pub,
    wallet,
    userId,
    owner,
    to: token as `0x${string}`,
    intent: { kind: "approval" },
  };
}
describe("journal before broadcast", () => {
  it("persists signed hash before broadcast and keeps uncertain submission pending", async () => {
    const f = setup();
    const r = await submitTransaction(f);
    expect(f.events).toEqual(["persist", "broadcast"]);
    expect(r.receipt).toBeNull();
    expect(r.hash).toMatch(/^0x[\da-f]{64}$/);
    expect(f.pub.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it("never broadcasts when durable storage fails", async () => {
    const f = setup(true);
    await expect(submitTransaction(f)).rejects.toThrow("nada foi transmitido");
    expect(f.pub.sendRawTransaction).not.toHaveBeenCalled();
  });
  it("classifies preparation, signing and journal failures as not broadcast", async () => {
    for (const phase of ["prepare", "sign", "journal"]) {
      const f = setup(phase === "journal");
      if (phase === "prepare")
        f.wallet.prepareTransactionRequest.mockRejectedValue(new Error("RPC unavailable"));
      if (phase === "sign") f.wallet.signTransaction.mockRejectedValue(new Error("signing failed"));
      await expect(submitTransaction(f)).rejects.toBeInstanceOf(BeforeBroadcastError);
      expect(f.pub.sendRawTransaction).not.toHaveBeenCalled();
    }
  });
  it("checks the actual estimated fee before signing even with a small balance", async () => {
    const f = setup();
    f.pub.getBalance.mockResolvedValue(21000n);
    await expect(submitTransaction({ ...f, value: 1n })).rejects.toBeInstanceOf(
      BeforeBroadcastError,
    );
    expect(f.wallet.signTransaction).not.toHaveBeenCalled();
    expect(f.pub.sendRawTransaction).not.toHaveBeenCalled();
    const r = await submitTransaction(f);
    expect(r.hash).toMatch(/^0x/);
  });
  it("checks gas before signing", async () => {
    const f = setup();
    f.pub.getGasPrice.mockResolvedValue(10000000000n);
    await expect(submitTransaction({ ...f, maxGasGwei: 5 })).rejects.toThrow("Gás");
    expect(f.wallet.signTransaction).not.toHaveBeenCalled();
  });
});
it("delayed buy uses receipt token delta, gas and original decision in one database transaction", async () => {
  const abi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
  const receipt = {
    status: "success",
    gasUsed: 21000n,
    effectiveGasPrice: 1000000000n,
    blockNumber: 99n,
    logs: [
      {
        address: token,
        topics: encodeEventTopics({ abi, eventName: "Transfer", args: { from: token, to: me } }),
        data: encodeAbiParameters([{ type: "uint256" }], [92000000000000000000n]),
        logIndex: 0,
      },
    ],
  } as unknown as TransactionReceipt;
  const admin = { rpc: vi.fn(async (_name: string, _args: unknown) => ({ error: null })) };
  const intent = {
    kind: "swap",
    botId: "b",
    mode: "estrategia",
    token,
    wallet: me,
    side: "compra",
    amountIn: "1000000000000000000",
    quotedOut: "100000000000000000000",
    decimals: 18,
    state: { ...EMPTY_STATE },
    decision: { action: "compra", reason: "signal" },
    priceUsd: 1,
    order: { side: "compra" },
  };
  await settleSubmission(
    admin,
    { getBlock: async () => ({ timestamp: 1792000000n }) },
    { id: "id", intent, tx_hash: `0x${"1".repeat(64)}` },
    receipt,
  );
  const args = admin.rpc.mock.calls[0]?.[1] as unknown as {
    p_order: Record<string, unknown>;
    p_patch: { strat_state: { tokens: number; costBnb: number; lastFillHash: string } };
  };
  expect(args.p_order["actual_token_delta"]).toBe("92000000000000000000");
  expect(args.p_patch.strat_state.tokens).toBe(92);
  expect(args.p_patch.strat_state.costBnb).toBeCloseTo(1.000021);
  expect(admin.rpc).toHaveBeenCalledTimes(1);
});
it("native receipts require a successful trace and exclude reverted branches", async () => {
  expect(
    await nativeProceeds(
      {
        request: async () => {
          throw new Error("unsupported");
        },
      },
      "0x1",
      me,
    ),
  ).toBeNull();
  const p = {
    request: async () => ({
      type: "CALL",
      from: me,
      to: token as `0x${string}`,
      value: "0x0",
      calls: [
        { type: "CALL", to: me, from: token, value: "0xa" },
        { type: "CALL", to: me, value: "0xff", error: "reverted" },
      ],
    }),
  };
  expect(await nativeProceeds(p, "0x1", me)).toBe(10n);
});

it("the real viem local account signs a BSC transaction without touching a real RPC", async () => {
  const { createWalletClient, custom, parseTransaction } = await import("viem");
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const { bsc } = await import("viem/chains");
  const account = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({
    account,
    chain: bsc,
    transport: custom({
      request: async ({ method }) => {
        if (method === "eth_chainId") return "0x38";
        if (method === "eth_getTransactionCount") return "0x0";
        if (method === "eth_gasPrice") return "0x3b9aca00";
        if (method === "eth_estimateGas") return "0x5208";
        if (method === "eth_getBlockByNumber")
          return {
            number: "0x1",
            hash: `0x${"0".repeat(64)}`,
            transactions: [],
            baseFeePerGas: null,
            gasLimit: "0x1c9c380",
            gasUsed: "0x0",
            timestamp: "0x1",
          };
        throw new Error(`Unexpected mock method ${method}`);
      },
    }),
  });
  const f = setup();
  await submitTransaction({ ...f, wallet });
  const raw = f.pub.sendRawTransaction.mock.calls[0]?.[0] as unknown as {
    serializedTransaction: `0x${string}`;
  };
  const tx = parseTransaction(raw.serializedTransaction);
  expect(tx.chainId).toBe(56);
  expect(tx.to?.toLowerCase()).toBe(token.toLowerCase());
  expect(tx.nonce).toBe(0);
});

it("rechecks the guided profit margin against the actual fee before signing or broadcast", async () => {
  const f = setup();
  await expect(
    submitTransaction({ ...f, intent: { kind: "swap", side: "compra", maxBuyFeeRaw: "20000" } }),
  ).rejects.toThrow("consome a margem");
  expect(f.wallet.signTransaction).not.toHaveBeenCalled();
  expect(f.pub.sendRawTransaction).not.toHaveBeenCalled();
});

it("preserves the withdrawal reserve against the actual prepared transaction fee before signing", async () => {
  const f = setup();
  f.pub.getBalance.mockResolvedValue(100000n);
  await expect(
    submitTransaction({
      ...f,
      value: 70000n,
      intent: { kind: "withdrawal", minimumRemainingBnbRaw: "10000" },
    }),
  ).rejects.toBeInstanceOf(BeforeBroadcastError);
  expect(f.wallet.signTransaction).not.toHaveBeenCalled();
  expect(f.pub.sendRawTransaction).not.toHaveBeenCalled();
});
it("records the token amount evidenced at the withdrawal recipient without treating it as a trade", async () => {
  const destination = "0x3333333333333333333333333333333333333333";
  const abi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
  const receipt = {
    status: "success",
    gasUsed: 21000n,
    effectiveGasPrice: 1n,
    blockNumber: 99n,
    logs: [
      {
        address: token,
        topics: encodeEventTopics({
          abi,
          eventName: "Transfer",
          args: { from: me, to: destination },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [92n]),
        logIndex: 0,
      },
    ],
  } as unknown as TransactionReceipt;
  const admin = { rpc: vi.fn(async (_name: string, _args: unknown) => ({ error: null })) };
  await settleSubmission(
    admin,
    {},
    {
      id: "id",
      tx_hash: `0x${"1".repeat(64)}`,
      intent: { kind: "withdrawal", token, from: me, to: destination, amount: "100" },
    },
    receipt,
  );
  expect(admin.rpc).toHaveBeenCalledWith(
    "complete_execution_submission",
    expect.objectContaining({
      p_order: null,
      p_patch: {},
      p_receipt: expect.objectContaining({ receivedTokenRaw: "92" }),
    }),
  );
});

it("keeps durable journaling before broadcast with telemetry enabled, and marks a lost response as uncertain", async () => {
  const { ExecutionClock } = await import("./executionTiming");
  const f = setup();
  const timing = new ExecutionClock("bot", "scope", token);
  timing.mark("signalDetected");
  const r = await submitTransaction({ ...f, timing });
  expect(f.events.slice(0, 2)).toEqual(["persist", "broadcast"]);
  expect(r.receipt).toBeNull();
  expect(timing.snapshot().stages.broadcastUncertain).toBeDefined();
  expect(timing.snapshot().stages.receiptObserved).toBeUndefined();
  expect(f.pub.sendRawTransaction).toHaveBeenCalledTimes(1);
});

describe("forced stop during a transaction", () => {
  it("blocks both approvals and swaps before signing when the bot is stopped", async () => {
    for (const kind of ["approval", "swap"]) {
      const f = setup();
      f.botStatus.mockResolvedValue({ data: { armed: false, archived_at: null }, error: null });
      await expect(
        submitTransaction({ ...f, intent: { kind, botId: "bot" } }),
      ).rejects.toBeInstanceOf(BeforeBroadcastError);
      expect(f.wallet.signTransaction).not.toHaveBeenCalled();
      expect(f.pub.sendRawTransaction).not.toHaveBeenCalled();
      expect(f.events).toEqual([]);
    }
  });
  it("closes the never-broadcast journal if stopped during signing", async () => {
    const f = setup();
    f.wallet.signTransaction.mockImplementation(async () => {
      f.botStatus.mockResolvedValue({ data: { armed: false, archived_at: null }, error: null });
      return "0x1234";
    });
    await expect(
      submitTransaction({ ...f, intent: { kind: "swap", botId: "bot" } }),
    ).rejects.toBeInstanceOf(BeforeBroadcastError);
    expect(f.events).toEqual(["persist"]);
    expect(f.pub.sendRawTransaction).not.toHaveBeenCalled();
    expect(f.admin.rpc).toHaveBeenCalledWith(
      "complete_execution_submission",
      expect.objectContaining({
        p_order: null,
        p_patch: {},
        p_receipt: expect.objectContaining({ status: "cancelled_before_broadcast" }),
      }),
    );
  });
  it("fails closed on status lookup failure", async () => {
    const f = setup();
    f.botStatus.mockResolvedValue({ data: { armed: true, archived_at: null }, error: "offline" });
    await expect(
      submitTransaction({ ...f, intent: { kind: "swap", botId: "bot" } }),
    ).rejects.toBeInstanceOf(BeforeBroadcastError);
    expect(f.wallet.signTransaction).not.toHaveBeenCalled();
  });
  it("retains uncertain journal failures without broadcasting", async () => {
    const f = setup();
    f.botStatus.mockResolvedValueOnce({ data: { armed: true, archived_at: null }, error: null });
    f.botStatus.mockResolvedValue({ data: { armed: false, archived_at: null }, error: null });
    f.admin.rpc.mockResolvedValue({ error: "offline" });
    let error: unknown;
    try {
      await submitTransaction({ ...f, intent: { kind: "swap", botId: "bot" } });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(BeforeBroadcastError);
    expect(f.pub.sendRawTransaction).not.toHaveBeenCalled();
  });
  it("keeps already broadcast transactions pending for reconciliation after stop", async () => {
    const f = setup();
    f.pub.sendRawTransaction.mockImplementation(async () => {
      f.events.push("broadcast");
      f.botStatus.mockResolvedValue({ data: { armed: false, archived_at: null }, error: null });
      throw new Error("response lost");
    });
    const result = await submitTransaction({ ...f, intent: { kind: "swap", botId: "bot" } });
    expect(result.receipt).toBeNull();
    expect(f.events).toEqual(["persist", "broadcast"]);
    expect(f.admin.rpc).not.toHaveBeenCalled();
  });
});
