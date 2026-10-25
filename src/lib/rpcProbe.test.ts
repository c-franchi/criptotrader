import { afterEach, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  http: () => () => ({ request }),
}));
import { probeRobotRpc } from "./robotRpc.server";
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
it("identifies a wrong network separately from an old block", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1000000);
  request.mockImplementation(async ({ method }) =>
    method === "eth_chainId" ? "0x1" : { timestamp: "0x3e8" },
  );
  expect((await probeRobotRpc())[0]).toMatchObject({ ok: false, reason: "wrong_network" });
  request.mockImplementation(async ({ method }) =>
    method === "eth_chainId" ? "0x38" : { timestamp: "0x1" },
  );
  expect((await probeRobotRpc())[0]).toMatchObject({ ok: false, reason: "stale_block" });
});
it.each([
  ["timeout", "timeout"],
  ["HTTP 429", "rate_limit"],
  ["connection reset", "connection"],
])("returns a safe reason for %s without exposing provider details", async (error, reason) => {
  request.mockRejectedValue(new Error(`${error} https://example.test?key=secret`));
  const result = await probeRobotRpc();
  expect(result[0]).toMatchObject({ ok: false, reason });
  expect(JSON.stringify(result)).not.toContain("secret");
});
