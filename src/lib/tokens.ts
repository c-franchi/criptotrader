export type TokenInfo = { address: `0x${string}`; symbol: string; name: string; decimals: number };

/** Built-in tokens, always available. Users can add more (stored per user). */
export const TOKENS: TokenInfo[] = [
  { address: "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA", symbol: "GTE", name: "Gold Tech", decimals: 18 },
  { address: "0xDbb962A6Fa2b9AEAf27Ec2D7fd5e820d479bdb3D", symbol: "BGA", name: "BIGHAIR", decimals: 18 },
  { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTCB", name: "Bitcoin (BSC)", decimals: 18 },
  { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", symbol: "ETH", name: "Ethereum (BSC)", decimals: 18 },
  { address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF", symbol: "SOL", name: "Solana (BSC)", decimals: 18 },
];

/** Widely held BEP-20 tokens checked when scanning a wallet (metadata is read on-chain). */
export const POPULAR_BSC_TOKENS: string[] = [
  ...TOKENS.map((t) => t.address),
  "0x55d398326f99059fF775485246999027B3197955", // USDT
  "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
  "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD
  "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", // FDUSD
  "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", // CAKE
  "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // ETH
  "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BTCB
  "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
  "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", // XRP
  "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", // DOGE
  "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47", // ADA
  "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402", // DOT
  "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", // LINK
  "0x4B0F1812e5Df2A09796481Ff14017e6005508003", // TWT
];

/** Token taxes known for built-in tokens (measured/announced). Unknown tokens default to 0 until the user sets them. */
export const KNOWN_TAX: Record<string, { buy: number; sell: number }> = {
  "0xa229c797c8e6a275cf5ee4cda37f5e619f15affa": { buy: 8, sell: 8 }, // GTE
};
export type TokenTax = { buy: number; sell: number };
export const taxFor = (addr: string, cfg?: { buyTaxPct?: number | undefined; sellTaxPct?: number | undefined }): TokenTax => {
  const k = KNOWN_TAX[addr.toLowerCase()] ?? { buy: 0, sell: 0 };
  return { buy: cfg?.buyTaxPct ?? k.buy, sell: cfg?.sellTaxPct ?? k.sell };
};
/** % the price must rise just to break even after paying both taxes. */
export const breakEvenPct = (t: TokenTax) => (1 / ((1 - t.buy / 100) * (1 - t.sell / 100)) - 1) * 100;
/** Gross price rise needed so the trade nets `netPct` after taxes. */
export const grossForNet = (netPct: number, t: TokenTax) => ((1 + netPct / 100) / ((1 - t.buy / 100) * (1 - t.sell / 100)) - 1) * 100;

export const findToken = (addr: string, extra: TokenInfo[] = []) =>
  [...TOKENS, ...extra].find((t) => t.address.toLowerCase() === addr.toLowerCase());
