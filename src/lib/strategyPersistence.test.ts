import { expect, it, vi } from "vitest";
import { persistStrategy } from "./strategyPersistence.server";
const input = {
  token: "0x1111111111111111111111111111111111111111",
  config: { buyAmount: 1 },
  wallet: null,
  version: 15,
  draftRevision: 0,
};
it("stores a draft while execution is pending without claiming it was applied", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({
      error: { message: "Execution in progress: wait for reconciliation before editing strategy" },
      data: null,
    })
    .mockResolvedValueOnce({ error: null, data: 1 });
  expect(await persistStrategy({ rpc }, "owner", input)).toMatchObject({
    status: "draft",
    version: 15,
    draftRevision: 1,
    message: expect.stringMatching(/pendente/),
  });
  expect(rpc.mock.calls.map((c) => c[0])).toEqual([
    "apply_strategy_with_draft",
    "save_strategy_draft",
  ]);
  expect(rpc.mock.calls[1]?.[1]).toMatchObject({
    p_user: "owner",
    p_base_version: 15,
    p_revision: 0,
  });
});
it("applies and consumes the draft through one guarded transaction", async () => {
  const rpc = vi.fn().mockResolvedValue({ error: null, data: null });
  expect(await persistStrategy({ rpc }, "owner", { ...input, draftRevision: 2 })).toMatchObject({
    status: "applied",
    version: 16,
    draftRevision: 0,
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0]?.[1]).toMatchObject({
    p_user: "owner",
    p_version: 15,
    p_draft_revision: 2,
  });
});
it("never retries an unknown database failure or overwrites a concurrently changed draft", async () => {
  for (const message of ["connection failed", "Draft changed"]) {
    const rpc = vi.fn().mockResolvedValue({ error: { message }, data: null });
    await expect(persistStrategy({ rpc }, "owner", input)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  }
});
it("preserves edits as a draft for open positions and stale strategy revisions", async () => {
  for (const message of ["Open position: preserve cycle configuration", "Strategy changed"]) {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: { message }, data: null })
      .mockResolvedValueOnce({ error: null, data: 2 });
    expect(await persistStrategy({ rpc }, "owner", { ...input, draftRevision: 1 })).toMatchObject({
      status: "draft",
      version: 15,
      draftRevision: 2,
    });
  }
});
