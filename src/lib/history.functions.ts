import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** 5-minute USD candles for the last ~25h from GeckoTerminal (free, no key). */
export const getCandles = createServerFn({ method: "GET" })
  .inputValidator((d: { pool: string }) => z.object({ pool: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(d))
  .handler(async ({ data }) => {
    const url = `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${data.pool}/ohlcv/minute?aggregate=5&limit=300&currency=usd`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Histórico indisponível (${res.status})`);
    const j = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    const list = j.data?.attributes?.ohlcv_list ?? [];
    return list.map((x) => [x[0], x[1], x[2], x[3], x[4]] as [number, number, number, number, number]).sort((a, b) => a[0] - b[0]);
  });
