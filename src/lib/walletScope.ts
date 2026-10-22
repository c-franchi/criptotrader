import { z } from "zod";
/** Existing accounts keep this scope; saved-wallet UUIDs identify additional portfolios. */
export const LEGACY_WALLET_SCOPE = "00000000-0000-0000-0000-000000000000";
export const walletScopeSchema = z.string().uuid().default(LEGACY_WALLET_SCOPE);
