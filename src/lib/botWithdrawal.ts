import { z } from "zod";
import { getAddress, parseEther } from "viem";
import { walletScopeSchema, LEGACY_WALLET_SCOPE } from "./walletScope";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const botWithdrawalSchema = z.object({
  walletScope: walletScopeSchema,
  to: address.optional(),
  from: address,
  assets: z
    .array(z.union([z.literal("BNB"), address]))
    .min(1)
    .max(100),
  keepBnb: z
    .string()
    .regex(/^\d+(\.\d{1,18})?$/)
    .optional(),
});
export type WithdrawalAsset = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  amount: bigint;
};
export function chooseWithdrawalAssets(assets: string[] | undefined, balances: WithdrawalAsset[]) {
  const selected = assets == null ? null : new Set(assets.map((a) => a.toLowerCase()));
  if (selected)
    for (const a of selected)
      if (a !== "bnb" && !balances.some((t) => t.address.toLowerCase() === a))
        throw new Error(
          "Token não reconhecido nesta consulta. Atualize os ativos antes de devolver.",
        );
  return {
    tokens: balances.filter(
      (t) => t.amount > 0n && (!selected || selected.has(t.address.toLowerCase())),
    ),
    retained: balances.filter(
      (t) => t.amount > 0n && selected && !selected.has(t.address.toLowerCase()),
    ),
    includeBnb: !selected || selected.has("bnb"),
  };
}
export function withdrawalDestination(
  scope: string,
  requested: string | undefined,
  saved: { id: string; address: string }[],
) {
  const mother = scope === LEGACY_WALLET_SCOPE ? undefined : saved.find((w) => w.id === scope);
  if (scope !== LEGACY_WALLET_SCOPE && !mother)
    throw new Error("A carteira mãe deste grupo não foi localizada. Atualize antes de devolver.");
  const to = mother?.address ?? requested;
  if (!to)
    throw new Error(
      "Esta carteira automática é original, sem carteira mãe vinculada. Escolha uma carteira sua já cadastrada para receber.",
    );
  if (mother && requested && mother.address.toLowerCase() !== requested.toLowerCase())
    throw new Error(
      "Destino diferente da carteira mãe deste grupo. Atualize a seleção; nada foi enviado.",
    );
  if (!saved.some((w) => w.address.toLowerCase() === to.toLowerCase()))
    throw new Error("O destino precisa estar salvo em Minhas carteiras.");
  return getAddress(to);
}
export function withdrawalBnbValue(balance: bigint, feeBuffer: bigint, keep: bigint) {
  const value = balance - feeBuffer - keep;
  return value > 0n ? value : 0n;
}
export const withdrawalReserve = (s: string | undefined) => (s == null ? 0n : parseEther(s));
