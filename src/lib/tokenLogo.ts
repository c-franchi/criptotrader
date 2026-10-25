import { getAddress, isAddress } from "viem";

/** Logos are display metadata, never token identity or evidence of safety. */
export function safeTokenLogo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["cdn.dexscreener.com", "dd.dexscreener.com", "assets-cdn.trustwallet.com"].includes(
        url.hostname,
      )
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function tokenLogoSources(address: string, logoUrl?: string | null) {
  const registry =
    address === "native"
      ? "https://assets-cdn.trustwallet.com/blockchains/smartchain/info/logo.png"
      : isAddress(address, { strict: false })
        ? `https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/${getAddress(address.toLowerCase())}/logo.png`
        : null;
  return [...new Set([safeTokenLogo(logoUrl), registry].filter((s): s is string => !!s))];
}

/** A pair's artwork belongs to its base token, not to any token on either side. */
export function marketTokenLogo(
  address: string,
  pairs: { baseToken?: { address?: string }; info?: { imageUrl?: string } }[],
) {
  for (const pair of pairs) {
    if (pair.baseToken?.address?.toLowerCase() !== address.toLowerCase()) continue;
    const logo = safeTokenLogo(pair.info?.imageUrl);
    if (logo) return logo;
  }
  return null;
}
