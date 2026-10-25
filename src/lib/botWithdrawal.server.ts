/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatEther } from "viem";
import { erc20Abi } from "./pancake";
import { contractTransaction, submitTransaction, settleSubmission } from "./submission.server";
import { chooseWithdrawalAssets, withdrawalBnbValue, type WithdrawalAsset } from "./botWithdrawal";
export type WithdrawalResult = {
  hashes: string[];
  status: "completed" | "partial" | "pending" | "failed";
  message: string;
};
/** Runs under the existing wallet-wide mutex. Never retries, skips a failed token, or sends BNB first. */
export async function returnBotAssets(o: {
  admin: any;
  pub: any;
  wallet: any;
  userId: string;
  owner: string;
  scope: string;
  from: `0x${string}`;
  to: `0x${string}`;
  tokens: {
    address: `0x${string}`;
    symbol: string;
    decimals: number;
    metadataUnavailable?: boolean;
  }[];
  assets?: string[];
  keepBnb: bigint;
}): Promise<WithdrawalResult> {
  const balances: WithdrawalAsset[] = [];
  // An unread token must not silently disappear from an "all" withdrawal.
  for (const t of o.tokens) {
    if (
      o.assets &&
      !o.assets.includes("BNB") &&
      !o.assets.some((a) => a.toLowerCase() === t.address.toLowerCase())
    ) {
      balances.push({ ...t, amount: 0n });
      continue;
    }
    try {
      balances.push({
        ...t,
        amount: await o.pub.readContract({
          address: t.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [o.from],
        }),
      });
    } catch {
      throw new Error(
        `Não foi possível consultar ${t.symbol}. Nenhuma devolução foi enviada; atualize e tente novamente.`,
      );
    }
  }
  const selection = chooseWithdrawalAssets(o.assets, balances);
  if (
    selection.tokens.some(
      (t) =>
        o.tokens.find((k) => k.address.toLowerCase() === t.address.toLowerCase())
          ?.metadataUnavailable,
    )
  )
    throw new Error(
      "Há token selecionado com metadados indisponíveis. Cadastre ou confira o contrato antes de devolver; nada foi enviado.",
    );
  const gasPrice = await o.pub.getGasPrice();
  let selectedFee = 0n,
    retainedFee = 0n;
  for (const t of [...selection.tokens, ...(selection.includeBnb ? selection.retained : [])]) {
    let gas: bigint;
    try {
      gas = await o.pub.estimateContractGas({
        account: o.from,
        address: t.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [o.to, t.amount],
      });
    } catch {
      throw new Error(
        `Não foi possível estimar o gás para ${t.symbol}. Nada foi enviado. Confira o token ou retire o BNB da seleção para preservar a reserva.`,
      );
    }
    const fee = gas * gasPrice * 2n;
    if (selection.tokens.includes(t)) selectedFee += fee;
    else retainedFee += fee;
  }
  // Keep enough for the estimated future withdrawal of tokens deliberately left behind.
  const keep = o.keepBnb > retainedFee ? o.keepBnb : retainedFee;
  if ((await o.pub.getBalance({ address: o.from })) < selectedFee + keep)
    throw new Error(
      "BNB insuficiente para devolver os tokens escolhidos e preservar a reserva. Nada foi enviado; revise a seleção e a reserva ou adicione BNB para gás.",
    );
  const hashes: string[] = [];
  const base = { admin: o.admin, userId: o.userId, owner: o.owner, pub: o.pub, wallet: o.wallet };
  const intentBase = { kind: "withdrawal", wallet_scope: o.scope, from: o.from, to: o.to };
  const settle = async (
    r: Awaited<ReturnType<typeof submitTransaction>>,
    intent: Record<string, unknown>,
  ) => {
    hashes.push(r.hash);
    if (!r.receipt) return false;
    await settleSubmission(o.admin, o.pub, { id: r.id, intent, tx_hash: r.hash }, r.receipt);
    if (r.receipt.status !== "success")
      throw new Error(
        "Transferência revertida na rede. As seguintes não foram enviadas; confira o histórico.",
      );
    return true;
  };
  try {
    for (const t of selection.tokens) {
      const intent = {
        ...intentBase,
        token: t.address,
        symbol: t.symbol,
        decimals: t.decimals,
        amount: t.amount.toString(),
        minimumRemainingBnbRaw: keep.toString(),
      };
      const r = await contractTransaction({
        ...base,
        to: t.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [o.to, t.amount],
        intent,
      });
      if (!(await settle(r, intent)))
        return {
          hashes,
          status: "pending",
          message:
            "Devolução enviada, aguardando confirmação. Os ativos seguintes, incluindo BNB, não foram enviados. Não repita enquanto estiver pendente.",
        };
    }
    if (selection.includeBnb) {
      const balance = await o.pub.getBalance({ address: o.from });
      if (balance <= keep)
        return {
          hashes,
          status: hashes.length ? "partial" : "completed",
          message:
            "Não há excedente de BNB após a reserva. Nenhum BNB foi enviado; confira as transferências no histórico.",
        };
      const price: bigint = await o.pub.getGasPrice();
      const gas: bigint = await o.pub.estimateGas({ account: o.from, to: o.to, value: 1n });
      const value = withdrawalBnbValue(balance, gas * price * 2n, keep);
      if (value > 0n) {
        const intent = {
          ...intentBase,
          symbol: "BNB",
          decimals: 18,
          amount: value.toString(),
          minimumRemainingBnbRaw: keep.toString(),
        };
        const r = await submitTransaction({ ...base, to: o.to, value, intent });
        if (!(await settle(r, intent)))
          return {
            hashes,
            status: "pending",
            message:
              "Devolução de BNB enviada, aguardando confirmação. Confira o histórico antes de repetir.",
          };
      } else
        return {
          hashes,
          status: hashes.length ? "partial" : "completed",
          message: `Não há excedente de BNB após a reserva de ${formatEther(keep)} BNB e o gás estimado. ${hashes.length ? "Os tokens enviados estão no histórico." : "Nenhuma transação foi necessária."}`,
        };
    }
    return {
      hashes,
      status: "completed",
      message: hashes.length
        ? `Devoluções confirmadas. Tokens foram enviados primeiro. ${selection.includeBnb ? "BNB enviado por último." : "BNB não foi selecionado e permaneceu na carteira automática."} Reserva mínima considerada: ${formatEther(keep)} BNB; a margem de gás pode deixar saldo adicional.`
        : "Não havia saldo dos ativos escolhidos para devolver. Nenhuma transação foi enviada.",
    };
  } catch (e) {
    return {
      hashes,
      status: hashes.length ? "partial" : "failed",
      message: `${e instanceof Error ? e.message : "Falha na devolução."} ${hashes.length ? "Confira cada hash no histórico; os ativos seguintes não foram enviados. Uma confirmação ainda pode estar pendente." : "Nenhuma transação desta tentativa foi transmitida."}`,
    };
  }
}
