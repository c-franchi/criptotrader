import { verifyPancakeV2SaleReceipt } from "./nativeSaleEvidence";
import type { NativeSaleProof, SaleReceipt } from "./nativeSaleEvidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Always verify the BSC chain and canonical block before trusting receipt evidence.
 * Missing RPC capabilities never cause a trade to be retried or a fabricated gain.
 */
export async function proveSaleWithPublicRpc(
  pub: any,
  hash: `0x${string}`,
  expected: { wallet: string; token: string; pair: string; amountInRaw: string },
  knownReceipt?: SaleReceipt,
): Promise<NativeSaleProof | null> {
  try {
    const [chainId, tx, receipt] = await Promise.all([
      pub.getChainId(),
      pub.getTransaction({ hash }),
      knownReceipt ?? pub.getTransactionReceipt({ hash }),
    ]);
    if (chainId !== 56 || !tx || !receipt) return null;
    if (tx.hash.toLowerCase() !== hash.toLowerCase()) return null;
    const canonical = await pub.getBlock({ blockNumber: receipt.blockNumber });
    if (
      !canonical?.hash ||
      canonical.hash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      receipt.transactionHash.toLowerCase() !== hash.toLowerCase()
    )
      return null;
    return verifyPancakeV2SaleReceipt(tx, receipt, expected);
  } catch {
    return null;
  }
}
