/** Minimum BNB the robot wallet needs to do one buy under the saved strategy. Pure. */
export const MIN_TRADE_BNB = 0.001; // smallest sensible swap when sizing is a percentage

export function requiredBotBnb(opts: { reserve: number; sizingMode?: "fixo" | "percentual"; buyAmount?: number }) {
  const trade = opts.sizingMode === "fixo" && (opts.buyAmount ?? 0) > 0 ? opts.buyAmount! : MIN_TRADE_BNB;
  return { reserve: opts.reserve, trade, total: opts.reserve + trade };
}

/** How much BNB is still missing after current balance + this send. 0 = ok. */
export function missingBnb(required: number, botBalance: number, sending: number) {
  const miss = required - botBalance - sending;
  return miss > 1e-9 ? Math.ceil(miss * 1e6) / 1e6 : 0;
}
