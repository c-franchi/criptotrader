import { describe, expect, it, vi } from "vitest";
import { getArchivedCandles, saveArchiveCandles } from "./marketHistoryArchive.server";

const POOL = "0x" + "a".repeat(40);
const TOKEN = "0x" + "b".repeat(40);

function fakeArchive() {
  const rows = new Map<number, number[]>();
  const client = {
    from: () => ({
      upsert: vi.fn(async (batch: { ts: number; candle: number[] }[]) => {
        for (const bar of batch) rows.set(bar.ts, bar.candle);
        return { error: null };
      }),
      select: () => {
        let before = Infinity;
        const q = {
          eq: () => q,
          lt: (_field: string, value: number) => {
            before = value;
            return q;
          },
          order: () => ({
            limit: async (n: number) => ({
              data: [...rows.entries()]
                .filter(([ts]) => ts < before)
                .sort((a, b) => b[0] - a[0])
                .slice(0, n)
                .map(([, candle]) => ({ candle })),
              error: null,
            }),
          }),
        };
        return q;
      },
    }),
  };
  return { client, rows };
}

describe("permanent OHLCV archive", () => {
  it("returns historical candles from the database after a fresh client reconnects", async () => {
    const { client } = fakeArchive();
    const candles: [number, number, number, number, number][] = [
      [300, 2, 3, 1, 2],
      [600, 3, 4, 2, 3],
      [900, 4, 5, 3, 4],
    ];
    expect(await saveArchiveCandles(POOL, TOKEN, candles, client)).toBe(3);
    expect(await getArchivedCandles(POOL, TOKEN, 900, 1000, client)).toEqual(candles.slice(0, 2));
    // Reopening another device does not depend on browser localStorage.
    expect(await getArchivedCandles(POOL, TOKEN, undefined, 1000, client)).toEqual(candles);
  });

  it("merges corrections by real candle timestamp and ignores non-OHLC data", async () => {
    const { client, rows } = fakeArchive();
    await saveArchiveCandles(POOL, TOKEN, [[300, 2, 3, 1, 2]], client);
    await saveArchiveCandles(
      POOL,
      TOKEN,
      [
        [300, 2, 4, 1, 3, 10],
        [600, 0, 0, 0, 0],
        [900, Number.NaN, 1, 1, 1],
      ],
      client,
    );
    expect(rows.size).toBe(1);
    expect(await getArchivedCandles(POOL, TOKEN, undefined, 1000, client)).toEqual([
      [300, 2, 4, 1, 3, 10],
    ]);
  });
});
