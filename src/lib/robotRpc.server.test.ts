import { expect, it, vi } from "vitest";
import { RobotRpcRouter } from "./robotRpc.server";
it("fails over reads after verifying chain 56 and never returns a stale latest block", async () => {
  const primary = vi.fn(async ({ method }: { method: string }) =>
    method === "eth_chainId" ? "0x38" : { timestamp: "0x1" },
  );
  const alt = vi.fn(async ({ method }: { method: string }) =>
    method === "eth_chainId" ? "0x38" : { timestamp: "0x3e8" },
  );
  const router = new RobotRpcRouter(
    [
      { alias: "Principal", request: primary },
      { alias: "Alternativo", request: alt },
    ],
    () => 1000000,
  );
  expect(
    await router.request({ method: "eth_getBlockByNumber", params: ["latest", false] }),
  ).toEqual({ timestamp: "0x3e8" });
  expect(router.snapshot()[0]?.failures).toBe(1);
  expect(alt).toHaveBeenCalledWith({ method: "eth_chainId" });
});
it("rejects a wrong network and does not re-broadcast a write through a fallback", async () => {
  const wrong = vi.fn(async () => "0x1"),
    good = vi.fn(async ({ method }: { method: string }) =>
      method === "eth_chainId" ? "0x38" : "0x2a",
    );
  const router = new RobotRpcRouter([
    { alias: "A", request: wrong },
    { alias: "B", request: good },
  ]);
  expect(await router.request({ method: "eth_getBalance", params: ["account", "latest"] })).toBe(
    "0x2a",
  );
  wrong.mockRejectedValueOnce(new Error("lost response"));
  const calls = good.mock.calls.length;
  await expect(
    router.request({ method: "eth_sendRawTransaction", params: ["signed"] }),
  ).rejects.toThrow("lost response");
  expect(good.mock.calls.length).toBe(calls);
});
it("does not bypass a contract revert at a different provider", async () => {
  const error = Object.assign(new Error("execution reverted"), { code: 3 });
  const a = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return "0x38";
      throw error;
    }),
    b = vi.fn();
  const router = new RobotRpcRouter([
    { alias: "A", request: a },
    { alias: "B", request: b },
  ]);
  await expect(router.request({ method: "eth_call" })).rejects.toThrow("execution reverted");
  expect(b).not.toHaveBeenCalled();
});
it("shares chain checks across concurrent reads and exposes aliases without URLs or request data", async () => {
  const a = vi.fn(async ({ method }: { method: string }) =>
    method === "eth_chainId" ? "0x38" : "0x2a",
  );
  const router = new RobotRpcRouter([{ alias: "Principal", request: a }]);
  await Promise.all([
    router.request({ method: "eth_getBalance" }),
    router.request({ method: "eth_blockNumber" }),
  ]);
  expect(a.mock.calls.filter(([c]) => c.method === "eth_chainId")).toHaveLength(1);
  expect(JSON.stringify(router.snapshot())).not.toContain("eth_getBalance");
});
