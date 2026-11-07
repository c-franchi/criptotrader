import { expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, parseAbi } from "viem";
import { PANCAKE_V2_ROUTER, WBNB, routerAbi } from "./pancake";
import { verifyPancakeV2SaleReceipt } from "./nativeSaleEvidence";
import type { SaleReceipt, SaleTx } from "./nativeSaleEvidence";

const wallet = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const pair = "0x3333333333333333333333333333333333333333";
const other = "0x4444444444444444444444444444444444444444";
const hash = ("0x" + "a".repeat(64)) as `0x${string}`;
const blockHash = ("0x" + "b".repeat(64)) as `0x${string}`;
const transferAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const withdrawAbi = parseAbi(["event Withdrawal(address indexed src,uint256 wad)"]);
const amount = 112_378n;
const received = 5_200_000_000_000_000n;
function transfer(address: string, from: string, to: string, value: bigint) {
  return {
    address,
    topics: encodeEventTopics({ abi: transferAbi, eventName: "Transfer", args: { from, to } }),
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
    logIndex: 0,
  };
}
function withdrawal(src: string, value: bigint) {
  return {
    address: WBNB,
    topics: encodeEventTopics({ abi: withdrawAbi, eventName: "Withdrawal", args: { src } }),
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
    logIndex: 1,
  };
}
function fixture() {
  const tx: SaleTx = {
    hash,
    from: wallet,
    to: PANCAKE_V2_ROUTER,
    value: 0n,
    input: encodeFunctionData({
      abi: routerAbi,
      functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
      args: [amount, received - 1n, [token, WBNB], wallet, 9999999999n],
    }),
  };
  const receipt: SaleReceipt = {
    transactionHash: hash,
    from: wallet,
    to: PANCAKE_V2_ROUTER,
    status: "success",
    blockHash,
    blockNumber: 100n,
    transactionIndex: 42,
    logs: [
      transfer(token, wallet, pair, amount),
      transfer(WBNB, pair, PANCAKE_V2_ROUTER, received),
      withdrawal(PANCAKE_V2_ROUTER, received),
    ],
  };
  return { tx, receipt, expected: { wallet, token, pair, amountInRaw: amount.toString() } };
}
it("proves exact router-native BNB proceeds without a paid trace or a wallet snapshot", () => {
  const { tx, receipt, expected } = fixture();
  expect(verifyPancakeV2SaleReceipt(tx, receipt, expected)).toMatchObject({
    source: "pancake_v2_wbnb_receipt",
    raw: received,
    evidence: { blockHash, transactionIndex: 42, inputRaw: amount.toString() },
  });
});
it("rejects a quote, another recipient, another router and a forged block receipt", () => {
  const { tx, receipt, expected } = fixture();
  expect(verifyPancakeV2SaleReceipt(tx, { ...receipt, status: "reverted" }, expected)).toBeNull();
  expect(
    verifyPancakeV2SaleReceipt({ ...tx, to: other }, receipt, expected),
  ).toBeNull();
  expect(
    verifyPancakeV2SaleReceipt(tx, { ...receipt, transactionHash: ("0x" + "f".repeat(64)) as `0x${string}` }, expected),
  ).toBeNull();
  expect(
    verifyPancakeV2SaleReceipt(
      { ...tx, input: encodeFunctionData({
        abi: routerAbi,
        functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
        args: [amount, received - 1n, [token, WBNB], other, 9999999999n],
      }) },
      receipt,
      expected,
    ),
  ).toBeNull();
});
it("does not mistake other pools, wrong token debits, duplicate withdrawals or incomplete WBNB events for proceeds", () => {
  const { tx, receipt, expected } = fixture();
  expect(verifyPancakeV2SaleReceipt(tx, receipt, { ...expected, pair: other })).toBeNull();
  const withoutTransfer = receipt.logs.filter((log) => log.address.toLowerCase() !== WBNB.toLowerCase() || log.topics.length !== 3);
  expect(verifyPancakeV2SaleReceipt(tx, { ...receipt, logs: withoutTransfer }, expected)).toBeNull();
  expect(verifyPancakeV2SaleReceipt(tx, { ...receipt, logs: [...receipt.logs, withdrawal(PANCAKE_V2_ROUTER, 1n)] }, expected)).toBeNull();
  expect(verifyPancakeV2SaleReceipt(tx, { ...receipt, logs: [transfer(token, wallet, pair, amount - 1n), ...receipt.logs.slice(1)] }, expected)).toBeNull();
  expect(verifyPancakeV2SaleReceipt(tx, { ...receipt, logs: [receipt.logs[0]!, transfer(WBNB, pair, PANCAKE_V2_ROUTER, received + 1n), receipt.logs[2]!] }, expected)).toBeNull();
});
it("never treats a token purchase as a native sale", () => {
  const { tx, receipt, expected } = fixture();
  const buy = encodeFunctionData({
    abi: routerAbi,
    functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
    args: [1n, [WBNB, token], wallet, 9999999999n],
  });
  expect(verifyPancakeV2SaleReceipt({ ...tx, input: buy, value: received }, receipt, expected)).toBeNull();
});
