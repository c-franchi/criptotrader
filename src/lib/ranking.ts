export type RankTransfer = { from: string; to: string; amountRaw: string };
export type WalletRank = { wallet: string; buys: number; sells: number; boughtRaw: string; soldRaw: string; volumeRaw: string; trades: number };

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

/** Ranks wallets by volume traded against the pool: buy = token left the pool to wallet; sell = wallet sent to pool. */
export function rankWallets(list: RankTransfer[], pool: string | undefined, top = 10): WalletRank[] {
  if (!pool) return [];
  const p = pool.toLowerCase();
  const map = new Map<string, { buys: number; sells: number; b: bigint; s: bigint }>();
  const get = (w: string) => { let e = map.get(w); if (!e) { e = { buys: 0, sells: 0, b: 0n, s: 0n }; map.set(w, e); } return e; };
  for (const t of list) {
    const from = t.from.toLowerCase(), to = t.to.toLowerCase();
    const amt = BigInt(t.amountRaw);
    if (from === p && to !== p && to !== ZERO && to !== DEAD) { const e = get(to); e.buys++; e.b += amt; }
    else if (to === p && from !== p && from !== ZERO) { const e = get(from); e.sells++; e.s += amt; }
  }
  return [...map.entries()]
    .map(([wallet, e]) => ({ wallet, buys: e.buys, sells: e.sells, boughtRaw: e.b.toString(), soldRaw: e.s.toString(), volumeRaw: (e.b + e.s).toString(), trades: e.buys + e.sells }))
    .sort((a, b) => { const d = BigInt(b.volumeRaw) - BigInt(a.volumeRaw); return d > 0n ? 1 : d < 0n ? -1 : b.trades - a.trades; })
    .slice(0, top);
}
