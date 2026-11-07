import { decodeEventLog, decodeFunctionData, parseAbi } from "viem";
import type { Hex } from "viem";
import { PANCAKE_V2_ROUTER, WBNB, routerAbi } from "./pancake";
import { walletTokenDelta } from "./receiptAudit";

/**
 * PancakeSwap V2 sends the exact WBNB unwrapped by its router to the
 * recipient of a successful swapExactTokensForETHSupportingFeeOnTransferTokens.
 * Verify the original call AND the WBNB events in that transaction receipt.
 * No wallet-balance subtraction, quoted output or generic Swap event is proof.
 */
const wbnbEvents = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Withdrawal(address indexed src,uint256 wad)",
]);
const lower = (value: string) => value.toLowerCase();
export type NativeSaleProof = {
  raw: bigint;
  source: "pancake_v2_wbnb_receipt";
  evidence: {
    chainId: 56;
    blockHash: string;
    blockNumber: string;
    transactionIndex: number;
    pairAddress: string;
    routerAddress: string;
    tokenAddress: string;
    inputRaw: string;
    wbnbTransferRaw: string;
    wbnbWithdrawalRaw: string;
  };
};
export type SaleTx = {
  hash: Hex;
  from: string;
  to: string | null;
  input: Hex;
  value: bigint;
};
export type SaleReceipt = {
  transactionHash: Hex;
  status: string;
  from: string;
  to: string | null;
  blockHash: Hex;
  blockNumber: bigint;
  transactionIndex: number;
  logs: readonly {
    address: string;
    data: Hex;
    topics: readonly Hex[];
    logIndex: number | null;
  }[];
};

/** The trace fallback must also prove the exact intended router call. */
export function matchesExpectedSaleTransaction(
  tx: SaleTx,
  expected: { wallet: string; token: string; pair: string; amountInRaw: string },
): boolean {
  if (
    tx.from.toLowerCase() !== expected.wallet.toLowerCase() ||
    !tx.to ||
    tx.to.toLowerCase() !== PANCAKE_V2_ROUTER.toLowerCase() ||
    tx.value !== 0n ||
    !/^0x[0-9a-f]{40}$/i.test(expected.pair)
  )
    return false;
  try {
    const decoded = decodeFunctionData({ abi: routerAbi, data: tx.input });
    if (decoded.functionName !== "swapExactTokensForETHSupportingFeeOnTransferTokens") return false;
    const [amount, , path, recipient] = decoded.args as readonly [
      bigint,
      bigint,
      readonly string[],
      string,
      bigint,
    ];
    return (
      amount > 0n &&
      amount === BigInt(expected.amountInRaw) &&
      path.length === 2 &&
      path[0]!.toLowerCase() === expected.token.toLowerCase() &&
      path[1]!.toLowerCase() === WBNB.toLowerCase() &&
      recipient.toLowerCase() === expected.wallet.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function verifyPancakeV2SaleReceipt(
  tx: SaleTx,
  receipt: SaleReceipt,
  expected: { wallet: string; token: string; pair: string; amountInRaw: string },
): NativeSaleProof | null {
  const wallet = lower(expected.wallet),
    token = lower(expected.token),
    pair = lower(expected.pair),
    router = lower(PANCAKE_V2_ROUTER);
  if (
    receipt.status !== "success" ||
    lower(receipt.transactionHash) !== lower(tx.hash) ||
    lower(tx.from) !== wallet ||
    lower(receipt.from) !== wallet ||
    !tx.to ||
    lower(tx.to) !== router ||
    !receipt.to ||
    lower(receipt.to) !== router ||
    tx.value !== 0n ||
    !matchesExpectedSaleTransaction(tx, expected)
  )
    return null;
  let inputAmount: bigint;
  let minimum: bigint;
  try {
    const decoded = decodeFunctionData({ abi: routerAbi, data: tx.input });
    if (decoded.functionName !== "swapExactTokensForETHSupportingFeeOnTransferTokens") return null;
    const [amount, minimumOut, path, recipient] = decoded.args as readonly [
      bigint,
      bigint,
      readonly string[],
      string,
      bigint,
    ];
    if (
      path.length !== 2 ||
      lower(path[0]!) !== token ||
      lower(path[1]!) !== lower(WBNB) ||
      lower(recipient) !== wallet
    )
      return null;
    if (BigInt(expected.amountInRaw) !== amount || amount <= 0n) return null;
    inputAmount = amount;
    minimum = minimumOut;
  } catch {
    return null;
  }

  // Restrict the evidence to this receipt's canonical WBNB contract and pool.
  const transfers: bigint[] = [],
    withdrawals: bigint[] = [];
  for (const log of receipt.logs) {
    if (lower(log.address) !== lower(WBNB)) continue;
    try {
      const e = decodeEventLog({
        abi: wbnbEvents,
        data: log.data,
        topics: [...log.topics] as [] | [Hex, ...Hex[]],
      });
      if (e.eventName === "Transfer") {
        if (lower(e.args.from) === pair && lower(e.args.to) === router)
          transfers.push(e.args.value);
      } else if (e.eventName === "Withdrawal" && lower(e.args.src) === router) {
        withdrawals.push(e.args.wad);
      }
    } catch {
      // No other WBNB events can be treated as evidence.
    }
  }
  // The single-hop router withdrawal must exactly match the pool's WBNB
  // payment. Any prefunding, nested swaps or ambiguous event pattern fails closed.
  if (
    transfers.length !== 1 ||
    withdrawals.length !== 1 ||
    transfers[0] !== withdrawals[0] ||
    withdrawals[0]! <= 0n ||
    withdrawals[0]! < minimum
  )
    return null;
  // The seller must really have spent this many tokens in that same receipt.
  const delta = walletTokenDelta(
    receipt.logs.map((log) => ({ ...log })),
    expected.token,
    expected.wallet,
  );
  if (delta !== -inputAmount) return null;
  return {
    raw: withdrawals[0]!,
    source: "pancake_v2_wbnb_receipt",
    evidence: {
      chainId: 56,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber.toString(),
      transactionIndex: receipt.transactionIndex,
      pairAddress: expected.pair,
      routerAddress: PANCAKE_V2_ROUTER,
      tokenAddress: expected.token,
      inputRaw: inputAmount.toString(),
      wbnbTransferRaw: transfers[0]!.toString(),
      wbnbWithdrawalRaw: withdrawals[0]!.toString(),
    },
  };
}
