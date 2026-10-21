import { formatEther, formatUnits, getAddress } from "viem";
import { pubClient } from "./bot.server";
import { walletTokenDelta, receiptEvents } from "./receiptAudit";
import { tokenMeta } from "./tokenMeta.server";

/** Read-only evidence. No pool or router intermediate is labelled native wallet proceeds. */
export async function inspectReceipt(
  hash: `0x${string}`,
  tokenAddress: string,
  walletAddress: string,
) {
  const pub = pubClient();
  const token = getAddress(tokenAddress),
    wallet = getAddress(walletAddress);
  const [tx, receipt, meta] = await Promise.all([
    pub.getTransaction({ hash }),
    pub.getTransactionReceipt({ hash }),
    tokenMeta(token),
  ]);
  const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
  const delta = walletTokenDelta(receipt.logs, token, wallet);
  const gas = receipt.gasUsed * receipt.effectiveGasPrice;
  return {
    hash,
    token,
    wallet,
    router: tx.to,
    block: receipt.blockNumber.toString(),
    transactionIndex: receipt.transactionIndex,
    timestamp: Number(block.timestamp) * 1000,
    status: receipt.status,
    decimals: meta.decimals,
    symbol: meta.symbol,
    tokenDeltaRaw: delta.toString(),
    tokenDelta: formatUnits(delta, meta.decimals),
    bnbSpent: tx.from.toLowerCase() === wallet.toLowerCase() ? formatEther(tx.value) : null,
    gasBnb: formatEther(gas),
    nativeReceived: null,
    nativeReceivedStatus:
      "Não confirmado: requer trace das transferências nativas isoladas desta transação",
    events: receiptEvents(receipt.logs),
  };
}
