import { expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";
import { walletTokenDelta } from "./receiptAudit";
const token = "0x1111111111111111111111111111111111111111",
  wallet = "0x2222222222222222222222222222222222222222",
  pair = "0x3333333333333333333333333333333333333333";
const abi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
it("counts only actual wallet credit, excluding router/tax intermediate amounts", () => {
  const log = (from: `0x${string}`, to: `0x${string}`, value: bigint) => ({
    address: token,
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
    topics: encodeEventTopics({ abi, eventName: "Transfer", args: { from, to } }).filter(
      (t): t is `0x${string}` => typeof t === "string",
    ),
    logIndex: 0,
  });
  expect(walletTokenDelta([log(pair, wallet, 92n), log(pair, pair, 8n)], token, wallet)).toBe(92n);
});
