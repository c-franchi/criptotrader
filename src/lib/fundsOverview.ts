import Decimal from "decimal.js";
const D = Decimal.clone({ precision: 100 });
export type FundWalletRef = {
  address: string;
  label: string;
  personal: boolean;
  bot: boolean;
  scopes: string[];
};
export type FundAsset = {
  name?: string;
  logoUrl?: string | null;
  address: string;
  symbol: string;
  amount: string | null;
  priceBnb: string | null;
};
export type FundWallet = FundWalletRef & {
  bnb: string | null;
  assets: FundAsset[];
  issues: string[];
  capital: { reserved: string; gas: string; free: string | null; shortfall?: string } | null;
};
/** The same on-chain address counts once, even if saved twice or shared by multiple bots. */
export function uniqueFundWallets(refs: FundWalletRef[]): FundWalletRef[] {
  const map = new Map<string, FundWalletRef>();
  for (const r of refs) {
    const key = r.address.toLowerCase(),
      previous = map.get(key);
    map.set(
      key,
      previous
        ? {
            ...previous,
            personal: previous.personal || r.personal,
            bot: previous.bot || r.bot,
            scopes: [...new Set([...previous.scopes, ...r.scopes])],
          }
        : { ...r, scopes: [...new Set(r.scopes)] },
    );
  }
  return [...map.values()];
}
/** Reservations and historical purchase cost are NOT additional assets. */
export function fundsTotal(wallets: FundWallet[]) {
  let native = new D(0),
    tokens = new D(0),
    complete = true,
    nativeComplete = true,
    missingAssets = 0;
  for (const w of wallets) {
    if (w.bnb == null) {
      complete = false;
      nativeComplete = false;
    } else native = native.plus(w.bnb);
    if (w.issues.length) complete = false;
    const seen = new Set<string>();
    for (const a of w.assets) {
      const key = a.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (a.amount == null || (new D(a.amount).gt(0) && a.priceBnb == null)) {
        complete = false;
        missingAssets++;
        continue;
      }
      if (a.priceBnb != null) tokens = tokens.plus(new D(a.amount ?? 0).mul(a.priceBnb));
    }
  }
  const known = native.plus(tokens).toFixed();
  return {
    total: complete ? known : null,
    known,
    native: nativeComplete ? native.toFixed() : null,
    tokens: tokens.toFixed(),
    missingAssets,
    complete,
    wallets: wallets.length,
  };
}

export function formatFundAmount(value: string, significant?: number) {
  const n = new D(value);
  const [whole, fraction] = (significant ? n.toSignificantDigits(significant) : n)
    .toFixed()
    .split(".");
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction ? "," + fraction : ""}`;
}

export function fundAssetValue(asset: FundAsset): string | null {
  return asset.amount == null || asset.priceBnb == null
    ? null
    : new D(asset.amount).mul(asset.priceBnb).toFixed();
}

/** Largest known holdings first; unknown valuations stay visible after known assets. */
export function fundWalletAssets(wallet: FundWallet) {
  return [
    {
      address: "native",
      symbol: "BNB",
      name: "BNB",
      amount: wallet.bnb,
      value: wallet.bnb,
      logoUrl: null as string | null | undefined,
    },
    ...wallet.assets.map((a) => ({ ...a, name: a.name ?? a.symbol, value: fundAssetValue(a) })),
  ].sort((a, b) => {
    if (a.value == null && b.value != null) return 1;
    if (b.value == null && a.value != null) return -1;
    const order = a.value != null && b.value != null ? new D(b.value).cmp(a.value) : 0;
    return order || a.address.localeCompare(b.address);
  });
}
