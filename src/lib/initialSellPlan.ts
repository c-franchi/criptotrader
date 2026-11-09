import Decimal from "decimal.js";
import { z } from "zod";

// ERC-20 balances can have 18 fractional digits plus many whole digits.
// Decimal.js defaults to 20 significant digits; that silently rounds a 50% plan.
const ExactAmount = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_DOWN });

/** This is a non-executable planning draft. The trading executor ignores it. */
export const initialSellDraftSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["sell_only", "sell_then_review"]),
  sharePct: z.number().int().min(1).max(100),
  minPriceBnb: z
    .string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/, "Informe o preço em BNB por token.")
    .refine((p) => {
      // Zod v3 runs refinements even when a regex check fails. A blank
      // initial input is normal in the robot form and must never throw:
      // Decimal("") would crash the entire /grade route during render.
      try {
        const amount = new Decimal(p);
        return amount.isFinite() && amount.greaterThan(0);
      } catch {
        return false;
      }
    }, "O preço precisa ser maior que zero."),
  balanceSnapshot: z.string().refine((p) => {
    try {
      return new Decimal(p).isFinite() && new Decimal(p).greaterThan(0);
    } catch {
      return false;
    }
  }, "Confirme que há tokens efetivamente na carteira."),
  walletAddress: z.string().regex(/^0x[0-9a-f]{40}$/i),
  tokenAddress: z.string().regex(/^0x[0-9a-f]{40}$/i),
  createdAt: z.string().datetime(),
});

export type InitialSellDraft = z.infer<typeof initialSellDraftSchema>;

/** Strict separation across user, bot wallet and token; never a global trading setting. */
export function initialSellDraftKey(
  userId: string,
  walletScope: string,
  walletAddress: string,
  token: string,
) {
  return [
    "cryptobot:initial-sell-preview:v1",
    userId,
    walletScope,
    walletAddress.toLowerCase(),
    token.toLowerCase(),
  ].join(":");
}

export function initialSellQuantity(balance: string, sharePct: number): string | null {
  if (!Number.isInteger(sharePct) || sharePct < 1 || sharePct > 100) return null;
  try {
    const amount = new ExactAmount(balance);
    if (!amount.isFinite() || amount.lte(0)) return null;
    return amount.mul(sharePct).div(100).toFixed();
  } catch {
    return null;
  }
}

export function validSellDraftForWallet(
  draft: unknown,
  walletAddress: string,
  tokenAddress: string,
  currentBalance: string,
): draft is InitialSellDraft {
  const parsed = initialSellDraftSchema.safeParse(draft);
  if (!parsed.success) return false;
  const p = parsed.data;
  // A deposit/withdrawal after review invalidates this preview. Never
  // silently reuse quantities or assume wallet custody based on old data.
  return (
    p.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
    p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() &&
    new Decimal(p.balanceSnapshot).eq(new Decimal(currentBalance))
  );
}
