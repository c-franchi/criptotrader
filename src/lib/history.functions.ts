import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readCandles, readCandleHistoryPage } from "./history.server";
import { watchMarketPair } from "./marketHistoryArchive.server";
import { readChartFeed } from "./chartFeed.server";

/** 5-minute USD candles for the last ~25h from GeckoTerminal (free, no key). */
export const getCandles = createServerFn({ method: "GET" })
  .inputValidator((d: { pool: string; token?: string }) =>
    z
      .object({
        pool: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        token: z
          .string()
          .regex(/^0x[0-9a-fA-F]{40}$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.token) await watchMarketPair(data.pool, data.token);
    return readCandles(data.pool, data.token);
  });

/** UI-only multi-provider 5m candles; never routed to the real strategy executor. */
export const getChartFeed = createServerFn({ method: "GET" })
  .inputValidator((d: { pool: string; token: string }) =>
    z
      .object({
        pool: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await watchMarketPair(data.pool, data.token);
    return readChartFeed(data.pool, data.token);
  });

/** Read-only historical chart page; before is Unix seconds, independent of executor data. */
export const getCandleHistoryPage = createServerFn({ method: "GET" })
  .inputValidator((d: { pool: string; token?: string; before: number }) =>
    z
      .object({
        pool: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        token: z
          .string()
          .regex(/^0x[0-9a-fA-F]{40}$/)
          .optional(),
        before: z.number().finite().int().positive(),
      })
      .parse(d),
  )
  .handler(({ data }) => readCandleHistoryPage(data.pool, data.token, data.before));
