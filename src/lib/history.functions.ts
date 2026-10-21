import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readCandles } from "./history.server";

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
  .handler(({ data }) => readCandles(data.pool, data.token));
