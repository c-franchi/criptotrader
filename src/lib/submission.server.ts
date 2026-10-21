/* eslint-disable @typescript-eslint/no-explicit-any */
import Decimal from "decimal.js";
import { encodeFunctionData, keccak256, formatEther, formatUnits, parseUnits } from "viem";
import type { TransactionReceipt } from "viem";
import { walletTokenDelta } from "./receiptAudit";
import { afterTrade, normalizeState } from "./autoStrategy";
import { releaseExecution } from "./executionLock.server";

/** Sign locally, persist hash + intent BEFORE broadcast. Never store raw signed transactions. */
export async function submitTransaction(o: {
  admin: any;
  userId: string;
  owner: string;
  pub: any;
  wallet: any;
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  intent: Record<string, any>;
  maxGasGwei?: number;
}) {
  if (o.maxGasGwei && (await o.pub.getGasPrice()) > BigInt(Math.round(o.maxGasGwei * 1e9)))
    throw new Error("Gás acima do limite configurado");
  const request = await o.wallet.prepareTransactionRequest({
    account: o.wallet.account,
    to: o.to,
    value: o.value ?? 0n,
    ...(o.data ? { data: o.data } : {}),
  });
  const signed = await o.wallet.signTransaction(request);
  const hash = keccak256(signed);
  const id = crypto.randomUUID();
  const { error } = await o.admin.from("execution_submissions").insert({
    id,
    user_id: o.userId,
    lock_owner: o.owner,
    tx_hash: hash,
    nonce: request.nonce,
    intent: o.intent,
  });
  if (error) throw new Error("Não foi possível registrar a transação; nada foi transmitido");
  // Any failure from here is indeterminate. The journal owns the hash, and the lock stays held.
  try {
    await o.pub.sendRawTransaction({ serializedTransaction: signed });
  } catch {
    /* receipt/nonce reconciliation only; never resend with another nonce */
  }
  let receipt: TransactionReceipt | null = null;
  try {
    receipt = await o.pub.waitForTransactionReceipt({ hash, timeout: 45_000, confirmations: 3 });
  } catch {
    /* pending */
  }
  return { id, hash, receipt };
}
export async function contractTransaction(
  o: Parameters<typeof submitTransaction>[0] & { abi: any; functionName: string; args: any[] },
) {
  return submitTransaction({
    ...o,
    data: encodeFunctionData({ abi: o.abi, functionName: o.functionName, args: o.args }),
  });
}

/** Native BNB is confirmed only by a complete, successful call trace of this transaction. */
export async function nativeProceeds(
  pub: any,
  hash: `0x${string}`,
  wallet: string,
): Promise<bigint | null> {
  try {
    const root = await pub.request({
      method: "debug_traceTransaction",
      params: [hash, { tracer: "callTracer" }],
    });
    if (!root || root.error || !root.type) return null;
    let sum = 0n;
    const visit = (c: any) => {
      if (c.error) return;
      if (["CALL", "CREATE", "CREATE2", "SELFDESTRUCT"].includes(String(c.type).toUpperCase())) {
        const value = BigInt(c.value ?? "0x0");
        if (String(c.to).toLowerCase() === wallet.toLowerCase()) sum += value;
        if (String(c.from).toLowerCase() === wallet.toLowerCase()) sum -= value;
      }
      for (const child of c.calls ?? []) visit(child);
    };
    visit(root);
    return sum >= 0n ? sum : null;
  } catch {
    return null;
  }
}

/** Used for immediate AND delayed receipts. RPC commits order, bot memory and journal atomically. */
export async function settleSubmission(
  admin: any,
  pub: any,
  submission: { id: string; intent: any; tx_hash: `0x${string}` },
  receipt: TransactionReceipt,
) {
  const i = submission.intent;
  const transactionGas = receipt.gasUsed * receipt.effectiveGasPrice;
  const gas = transactionGas + BigInt(i.approvalGasRaw ?? "0");
  let patch: Record<string, unknown> = {};
  let order: Record<string, unknown> | null = null;
  if (i.kind === "swap") {
    const success = receipt.status === "success";
    const delta = walletTokenDelta(receipt.logs, i.token, i.wallet);
    const native =
      success && i.side === "venda"
        ? await nativeProceeds(pub, submission.tx_hash, i.wallet)
        : null;
    order = {
      ...i.order,
      tx_hash: submission.tx_hash,
      status: success ? "confirmada" : "falhou",
      block_number: Number(receipt.blockNumber),
      error: success ? null : "Transação revertida na rede",
      gas_bnb: formatEther(gas),
      actual_token_delta: delta.toString(),
      actual_bnb_received: native == null ? null : formatEther(native),
      accounting_status: i.side === "compra" || native != null ? "confirmado" : "estimado",
    };
    if (success && i.botId) {
      if (i.mode === "grade") {
        const old = normalizeState(i.state, Date.now());
        const tokens = Math.abs(Number(formatUnits(delta, i.decimals)));
        const bnb = Number(
          formatEther(
            i.side === "compra" ? BigInt(i.amountIn) + gas : (native ?? BigInt(i.quotedOut)) - gas,
          ),
        );
        const state = afterTrade(
          old,
          i.side === "compra"
            ? { action: "compra", reason: "Grade" }
            : { action: "venda", reason: "Grade", sellPct: 100, all: tokens >= old.tokens },
          { priceUsd: i.priceBnb, bnb, tokens, now: Date.now() },
        );
        patch = {
          last_level: i.nextLevel,
          strat_state: {
            ...state,
            lastFillHash: submission.tx_hash,
            accountingEstimated: native == null && i.side === "venda",
          },
          last_error: null,
        };
      } else {
        const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
        const now = Number(block.timestamp) * 1000;
        const tokens = Math.abs(Number(formatUnits(delta, i.decimals)));
        if (!(tokens > 0))
          throw new Error("Receipt sem movimento de tokens; conciliação manual necessária");
        const bnb =
          i.side === "compra"
            ? Number(formatEther(BigInt(i.amountIn) + gas))
            : Number(formatEther((native ?? BigInt(i.quotedOut)) - gas));
        const old = normalizeState(i.state, now);
        const next = afterTrade(old, i.decision, { priceUsd: i.priceUsd, bnb, tokens, now });
        patch = {
          strat_state: {
            ...next,
            tokensRaw: (next.tokens > 0
              ? (i.state.tokensRaw != null
                  ? BigInt(i.state.tokensRaw)
                  : parseUnits(
                      new Decimal(i.state.tokens ?? 0).toFixed(i.decimals, Decimal.ROUND_DOWN),
                      i.decimals,
                    )) + delta
              : 0n
            ).toString(),
            lastFillHash: submission.tx_hash,
            accountingEstimated:
              i.state?.accountingEstimated || (native == null && i.side === "venda"),
          },
          last_error: null,
          last_reason:
            native == null && i.side === "venda"
              ? "Venda confirmada; BNB recebido ainda estimado, aguardando trace"
              : i.decision.reason,
        };
      }
    }
  }
  const { error } = await admin.rpc("complete_execution_submission", {
    p_id: submission.id,
    p_order: order,
    p_patch: patch,
    p_receipt: {
      status: receipt.status,
      block: receipt.blockNumber.toString(),
      gasBnb: formatEther(transactionGas),
      executionGasBnb: formatEther(gas),
    },
  });
  if (error) throw error;
}
export async function reconcileSubmissions(admin: any, pub: any) {
  const { data: pending, error } = await admin
    .from("execution_submissions")
    .select("*")
    .is("finished_at", null)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) throw error;
  const started = Date.now();
  for (const row of pending ?? []) {
    if (Date.now() - started > 30000) break;
    try {
      await admin
        .from("execution_submissions")
        .update({ checked_at: new Date().toISOString() })
        .eq("id", row.id);
      const receipt = await pub.getTransactionReceipt({ hash: row.tx_hash });
      await settleSubmission(admin, pub, row, receipt);
    } catch {
      /* no receipt / RPC or database unavailable: keep journal + lock */
    }
  }
  const { data: locks } = await admin.from("bot_execution_locks").select("user_id,owner");
  for (const lock of locks ?? []) {
    const { data: entries, error: e } = await admin
      .from("execution_submissions")
      .select("finished_at,intent")
      .eq("lock_owner", lock.owner);
    if (e || !entries?.length || entries.some((x: any) => !x.finished_at)) continue;
    // A lock younger than the maximum request lifetime may still have code between two sends.
    const { data: held } = await admin
      .from("bot_execution_locks")
      .select("acquired_at")
      .eq("owner", lock.owner)
      .maybeSingle();
    if (!held || Date.now() - new Date(held.acquired_at).getTime() < 15 * 60_000) continue;
    await releaseExecution(admin, lock.user_id, lock.owner);
  }
}
