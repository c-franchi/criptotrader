import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarket } from "@/lib/chain.functions";
import { getCandles } from "@/lib/history.functions";
import { cn } from "@/lib/utils";

const PERIODS = [
  { id: "1H", ms: 3_600_000 },
  { id: "4H", ms: 4 * 3_600_000 },
  { id: "12H", ms: 12 * 3_600_000 },
  { id: "1D", ms: 24 * 3_600_000 },
] as const;

const usd = (n: number) => `$${n < 0.01 ? n.toPrecision(4) : n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}`;

/** Price header + line chart from real pool history. Shows "indisponível" instead of inventing data. */
export function TokenChart({ address, symbol }: { address: string; symbol: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("1D");
  const market = useQuery({ queryKey: ["market", address], queryFn: () => getMarket({ data: { address } }), refetchInterval: 30_000 });
  const pools = market.data?.pools ?? [];
  const pool = pools.find((p) => p.supported)?.pairAddress ?? pools[0]?.pairAddress;
  const candles = useQuery({ queryKey: ["candles", pool], enabled: !!pool, queryFn: () => getCandles({ data: { pool: pool! } }), refetchInterval: 120_000, retry: 2, retryDelay: 3000 });

  const ms = PERIODS.find((p) => p.id === period)!.ms;
  const all = candles.data ?? [];
  const lastT = all.length ? all[all.length - 1]![0] * 1000 : 0;
  const pts = all.filter((c) => c[0] * 1000 >= lastT - ms).map((c) => c[4]);
  const live = pools[0]?.priceUsd ? Number(pools[0].priceUsd) : null;
  const price = live ?? (pts.length ? pts[pts.length - 1]! : null);
  const first = pts[0];
  const change = first && price ? ((price - first) / first) * 100 : null;
  const up = (change ?? 0) >= 0;

  const W = 320, H = 140;
  let path = "", area = "";
  if (pts.length > 1) {
    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 6 - ((v - min) / span) * (H - 12)] as const);
    path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    area = `${path} L${W},${H} L0,${H} Z`;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xl font-bold">{symbol}</p>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold">{price != null ? usd(price) : "—"}</p>
          {change != null
            ? <p className={cn("text-sm font-medium", up ? "text-success" : "text-destructive")}>{up ? "+" : ""}{change.toFixed(2)}% · {period}</p>
            : <p className="text-xs text-muted-foreground">variação indisponível</p>}
        </div>
      </div>
      <div className="mt-3 h-36">
        {path ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-full w-full", up ? "text-success" : "text-destructive")}>
            <path d={area} fill="currentColor" opacity={0.12} />
            <path d={path} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {market.isLoading || candles.isLoading ? "Carregando gráfico…" : !pool ? "Sem pool com histórico para este token" : "Histórico indisponível agora"}
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-1">
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)} className={cn("rounded-full px-3 py-1 text-sm", period === p.id ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground")}>{p.id}</button>
        ))}
      </div>
    </div>
  );
}
