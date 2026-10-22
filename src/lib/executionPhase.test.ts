import { expect, it } from "vitest";
import { BeforeSigningError, withExecutionPhase } from "./executionPhase";
it("distinguishes proven read-only failures from failures after entering the signer", async () => {
  await expect(
    withExecutionPhase(async () => {
      throw new Error("RPC read");
    }),
  ).rejects.toBeInstanceOf(BeforeSigningError);
  const original = new Error("unknown submission");
  await expect(
    withExecutionPhase(async (begin) => {
      begin();
      throw original;
    }),
  ).rejects.toBe(original);
});
