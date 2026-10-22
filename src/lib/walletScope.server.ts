/* eslint-disable @typescript-eslint/no-explicit-any */
import { LEGACY_WALLET_SCOPE } from "./walletScope";
export async function assertWalletScope(admin: any, userId: string, scope: string) {
  if (scope === LEGACY_WALLET_SCOPE) return;
  const { data, error } = await admin
    .from("user_wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("id", scope)
    .maybeSingle();
  if (error || !data) throw new Error("A carteira selecionada não pertence à sua conta.");
}
