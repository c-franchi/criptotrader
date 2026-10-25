import { decodeFunctionData } from "viem";
import { expect, it } from "vitest";
import { fundingTransfer } from "./fundingTransfer";
import { erc20Abi } from "./pancake";
const from = "0x" + "1".repeat(40),
  recipient = "0x" + "2".repeat(40),
  token = "0x55d398326f99059fF775485246999027B3197955";
it("sends USDT to its contract with zero native value and the real recipient encoded in transfer", () => {
  const tx = fundingTransfer(from, recipient, token, 373000000000000000n);
  expect(tx.to).toBe(token);
  expect(tx.value).toBe("0x0");
  expect(decodeFunctionData({ abi: erc20Abi, data: tx.data })).toEqual({
    functionName: "transfer",
    args: [recipient, 373000000000000000n],
  });
});
it("sends native BNB to the receiver and rejects the token contract as recipient", () => {
  expect(fundingTransfer(from, recipient, null, 1n)).toMatchObject({
    to: recipient,
    value: "0x1",
    data: "0x",
  });
  expect(() => fundingTransfer(from, token, token, 1n)).toThrow(/contrato/);
  expect(() => fundingTransfer(from, recipient, token, 0n)).toThrow();
});
