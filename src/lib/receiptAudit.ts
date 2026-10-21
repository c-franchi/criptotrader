import { decodeEventLog, parseAbi } from "viem";
const abi = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
  "event Withdrawal(address indexed src,uint256 wad)",
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
]);
export type AuditLog = {
  address: string;
  data: `0x${string}`;
  topics: readonly `0x${string}`[];
  logIndex: number | null;
};
export function walletTokenDelta(logs: AuditLog[], token: string, wallet: string): bigint {
  let delta = 0n;
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi,
        data: log.data,
        topics: [...log.topics] as [] | [`0x${string}`, ...`0x${string}`[]],
      });
      if (event.eventName !== "Transfer") continue;
      if (event.args.to.toLowerCase() === wallet.toLowerCase()) delta += event.args.value;
      if (event.args.from.toLowerCase() === wallet.toLowerCase()) delta -= event.args.value;
    } catch {
      /* other event */
    }
  }
  return delta;
}
export function receiptEvents(logs: AuditLog[]) {
  return logs.flatMap((log) => {
    try {
      const e = decodeEventLog({
        abi,
        data: log.data,
        topics: [...log.topics] as [] | [`0x${string}`, ...`0x${string}`[]],
      });
      return [
        {
          contract: log.address,
          index: log.logIndex,
          event: e.eventName,
          args: Object.fromEntries(
            Object.entries(e.args).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
          ),
        },
      ];
    } catch {
      return [];
    }
  });
}
