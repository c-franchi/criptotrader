import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** 5-minute USD candles for the last ~25h from GeckoTerminal (free, no key). */
export const getCandles = createServerFn({ method: "GET" })
  .inputValidator((d: { pool: string }) => z.object({ pool: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(d))
  .handler(async ({ data }) => {
    const base = `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${data.pool}/ohlcv/minute`;
    const headers = { accept: "application/json", "user-agent": "gte-monitor/1.0" };
    let res = await fetch(`${base}?aggregate=5&limit=300&currency=usd`, { headers });
    if (!res.ok) {
      // transient rate-limit/server error: retry once with a lighter request
      await new Promise((r) => setTimeout(r, 1500));
      res = await fetch(`${base}?aggregate=15&limit=100&currency=usd`, { headers });
    }
    if (!res.ok) throw new Error(`Histórico indisponível (${res.status})`);
    const j = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
    const list = j.data?.attributes?.ohlcv_list ?? [];
    return list.map((x) => [x[0], x[1], x[2], x[3], x[4]] as [number, number, number, number, number]).sort((a, b) => a[0] - b[0]);
  });
