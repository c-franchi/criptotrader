import { beforeEach, expect, it, vi } from "vitest";

const { source, archive } = vi.hoisted(() => ({
  source: vi.fn(),
  archive: vi.fn(),
}));
vi.mock("./history.server", () => ({ fetchGecko: source }));
vi.mock("./marketHistoryArchive.server", () => ({ saveArchiveCandles: archive }));

import { tickMarketHistory } from "./historyIngestion.server";
const POOL = "0x" + "a".repeat(40);
const TOKEN = "0x" + "b".repeat(40);

function mockDb() {
  const changes: Record<string, unknown>[] = [];
  const update = vi.fn((value: Record<string, unknown>) => {
    changes.push(value);
    const q = { eq: () => q, then: (resolve: (value: unknown) => void) => resolve({ error: null }) };
    return q;
  });
  const upsert = vi.fn(async () => ({ error: null }));
  return {
    changes,
    update,
    upsert,
    db: {
      rpc: vi.fn(async () => ({
        data: [{ pool: POOL, token: TOKEN, backfill_before: null, backfill_complete: false }],
        error: null,
      })),
      from: (name: string) => {
        if (name === "market_candle_heartbeat") return { upsert };
        return { update };
      },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

it("persists recent and old real OHLCV while the frontend is closed", async () => {
  const { db, changes, upsert } = mockDb();
  source.mockResolvedValueOnce([[900, 2, 3, 1, 2]]).mockResolvedValueOnce([[300, 1, 2, 1, 2]]);
  archive.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
  const status = await tickMarketHistory(db);
  expect(status).toEqual({ claimed: 1, saved: 1, backfilled: 1, failed: 0 });
  expect(source).toHaveBeenCalledWith(POOL, TOKEN, true);
  expect(source).toHaveBeenCalledWith(POOL, TOKEN, false, 900);
  expect(archive).toHaveBeenCalledTimes(2);
  expect(changes[0]).toMatchObject({ backfill_before: 300, backfill_complete: false });
  expect(upsert).toHaveBeenCalledTimes(1);
});

it("does not fabricate candles after public API failures and records a retry", async () => {
  const { db, changes } = mockDb();
  source.mockRejectedValue(new Error("Histórico indisponível (429)"));
  const status = await tickMarketHistory(db);
  expect(status.failed).toBe(1);
  expect(archive).not.toHaveBeenCalled();
  expect(changes[0]).toMatchObject({ last_error: "Histórico indisponível (429)" });
});
