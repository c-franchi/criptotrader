import { LEGACY_WALLET_SCOPE } from "./walletScope";
import type { FundWallet } from "./fundsOverview";
/** Signing wallets are parents; service-owned robot addresses are never manual wallet choices. */
export function personalFundWallets(wallets: FundWallet[]) {
  return wallets.filter((w) => w.personal && !w.bot);
}
export function relatedRobotWallets(wallets: FundWallet[], scopes: string[]) {
  return wallets.filter(
    (w) => w.bot && (w.robotScopes ?? w.scopes).some((s) => scopes.includes(s)),
  );
}
export function hasOriginalRobots(wallets: FundWallet[]) {
  return relatedRobotWallets(wallets, [LEGACY_WALLET_SCOPE]).length > 0;
}
