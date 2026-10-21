import { describe, expect, it } from "vitest";
import { rankWallets } from "./ranking";

const P = "0xpool";
describe("rankWallets", () => {
  it("counts buys from pool and sells to pool, ordered by volume", () => {
    const r = rankWallets(
      [
        { from: P, to: "0xa", amountRaw: "100" },
        { from: "0xa", to: P, amountRaw: "50" },
        { from: P, to: "0xb", amountRaw: "500" },
        { from: "0xc", to: "0xd", amountRaw: "9999" },
      ],
      P,
    );
    expect(r.map((x) => x.wallet)).toEqual(["0xb", "0xa"]);
    expect(r[1]).toMatchObject({ buys: 1, sells: 1, volumeRaw: "150", trades: 2 });
  });
  it("limits to top 10 and needs a pool", () => {
    const list = Array.from({ length: 15 }, (_, i) => ({
      from: P,
      to: `0x${i}`,
      amountRaw: String(i + 1),
    }));
    expect(rankWallets(list, P)).toHaveLength(10);
    expect(rankWallets(list, undefined)).toEqual([]);
  });
});
