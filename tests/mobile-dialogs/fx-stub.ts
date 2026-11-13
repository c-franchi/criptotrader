// Chart formatting only; no remote exchange-rate or auth functions in this isolated fixture.
export async function getFxQuote() {
  return { at: Date.now(), bnbUsd: null, usdBrl: null, usdEur: null };
}
