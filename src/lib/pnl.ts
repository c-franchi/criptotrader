// Pure trade-result math (average-cost method). Amounts are plain numbers in BNB / token units.
export type Fill = { side: "compra" | "venda"; bnb: number; tokens: number; at: string };

export type Pnl = {
  buys: number;
  sells: number;
  bnbSpent: number;
  bnbReceived: number;
  tokensBought: number;
  tokensSold: number;
  position: number; // tokens still held from these trades
  avgCost: number | null; // BNB per token of the open position
  realized: number; // BNB gained (+) or lost (-) on sales
  lastSell: Fill | null;
  lastBuy: Fill | null;
};

export function computePnl(fills: Fill[]): Pnl {
  const sorted = [...fills].sort((a, b) => a.at.localeCompare(b.at));
  let pos = 0,
    cost = 0,
    realized = 0;
  const r: Pnl = {
    buys: 0,
    sells: 0,
    bnbSpent: 0,
    bnbReceived: 0,
    tokensBought: 0,
    tokensSold: 0,
    position: 0,
    avgCost: null,
    realized: 0,
    lastSell: null,
    lastBuy: null,
  };
  for (const f of sorted) {
    if (f.side === "compra") {
      r.buys++;
      r.bnbSpent += f.bnb;
      r.tokensBought += f.tokens;
      r.lastBuy = f;
      pos += f.tokens;
      cost += f.bnb;
    } else {
      r.sells++;
      r.bnbReceived += f.bnb;
      r.tokensSold += f.tokens;
      r.lastSell = f;
      // Tokens sold that were not bought here (already in the wallet) have unknown cost: count only the covered part.
      const covered = Math.min(f.tokens, pos);
      const avg = pos > 0 ? cost / pos : 0;
      if (covered > 0) realized += f.bnb * (covered / f.tokens) - avg * covered;
      cost -= avg * covered;
      pos -= covered;
    }
  }
  r.position = pos;
  r.avgCost = pos > 0 ? cost / pos : null;
  r.realized = realized;
  return r;
}

/** Compares a new buy with the last sale: positive = buying back more tokens per BNB than you sold for. */
export function rebuyEdgePct(lastSell: Fill, buyBnb: number, buyTokens: number): number | null {
  if (!lastSell.bnb || !lastSell.tokens || !buyBnb || !buyTokens) return null;
  const soldRate = lastSell.tokens / lastSell.bnb; // tokens per BNB when selling
  const buyRate = buyTokens / buyBnb;
  return (buyRate / soldRate - 1) * 100;
}
