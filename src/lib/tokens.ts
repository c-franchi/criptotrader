export type TokenInfo = { address: `0x${string}`; symbol: string; name: string; decimals: number };

export const TOKENS: TokenInfo[] = [
  { address: "0xA229C797c8e6a275cF5Ee4Cda37f5e619F15AffA", symbol: "GTE", name: "Gold Tech", decimals: 18 },
  { address: "0xDbb962A6Fa2b9AEAf27Ec2D7fd5e820d479bdb3D", symbol: "BGA", name: "BIGHAIR", decimals: 18 },
];

export const findToken = (addr: string) => TOKENS.find((t) => t.address.toLowerCase() === addr.toLowerCase());
