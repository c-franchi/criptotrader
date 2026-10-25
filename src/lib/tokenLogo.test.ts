import { expect, it } from "vitest";
import { marketTokenLogo, safeTokenLogo, tokenLogoSources } from "./tokenLogo";
it("resolves a chain-specific checksum address rather than a ticker", () => {
  expect(tokenLogoSources("0x55d398326f99059ff775485246999027b3197955")[0]).toContain(
    "/smartchain/assets/0x55d398326f99059fF775485246999027B3197955/logo.png",
  );
  expect(tokenLogoSources("native")[0]).toContain("/smartchain/info/logo.png");
  expect(tokenLogoSources("USDT")).toEqual([]);
});
it("uses a matching base token artwork and never the other side of a pair", () => {
  const pairs = [
    {
      baseToken: { address: "0xother" },
      info: { imageUrl: "https://cdn.dexscreener.com/other.png" },
    },
    {
      baseToken: { address: "0xTOKEN" },
      info: { imageUrl: "https://cdn.dexscreener.com/token.png" },
    },
  ];
  expect(marketTokenLogo("0xtoken", pairs)).toBe("https://cdn.dexscreener.com/token.png");
  expect(marketTokenLogo("0xquote", pairs)).toBeNull();
});
it("rejects arbitrary tracking origins, credentials and non-HTTPS URLs", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://example.com/logo.png",
    "https://cdn.dexscreener.com.evil.test/a",
    "https://user:pass@cdn.dexscreener.com/a",
    "http://cdn.dexscreener.com/a",
  ])
    expect(safeTokenLogo(value)).toBeNull();
});
