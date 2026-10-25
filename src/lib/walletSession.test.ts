import { expect, it, vi } from "vitest";
import { verifyWalletSession } from "./walletSession";
it("checks the actual provider account and chain, including changes after the UI connected", async () => {
  let account = "0xabc",
    chain = "0x38";
  const p = {
    request: vi.fn(async ({ method }: { method: string }) =>
      method === "eth_accounts" ? [account] : chain,
    ),
  };
  await expect(verifyWalletSession(p, "0xABC")).resolves.toBeUndefined();
  account = "0xother";
  await expect(verifyWalletSession(p, "0xabc")).rejects.toThrow(/Conta diferente/);
  account = "0xabc";
  chain = "0x1";
  await expect(verifyWalletSession(p, "0xabc")).rejects.toThrow(/56/);
  expect(
    p.request.mock.calls.every(([call]) => ["eth_accounts", "eth_chainId"].includes(call.method)),
  ).toBe(true);
});
