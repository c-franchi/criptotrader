import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { getMarket } from "@/lib/chain.functions";
import { useCandles } from "@/hooks/useCandles";
import { chartWindow } from "@/lib/chart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CandleChart } from "@/components/CandleChart";

const PERIODS = [
  { id: "1H", ms: 3_600_000 }, { id: "4H", ms: 4 * 3_600_000 },
  { id: "12H", ms: 12 * 3_600_000 }, { id: "1D", ms: 24 * 3_600_000 },
] as const;
const usd = (n: number) => `US$ ${n.toLocaleString("pt-BR", { maximumSignificantDigits: 6 })}`;
const time = (n: number) => new Date(n).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function TokenChart(props: { address: string; symbol: string }) {
  return <PriceChart key={props.address} {...props} />;
}

function PriceChart({ address, symbol }: { address: string; symbol: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("1D");
  const [now, setNow] = useState(0);
  const [pool, setPool] = useState<string>();
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const market = useQuery({ queryKey: ["market", address], queryFn: () => getMarket({ data: { address } }), staleTime: 10_000, refetchInterval: 15_000, retry: 1 });
  const pools = market.data?.pools ?? [];
  useEffect(() => {
    if (pool) return;
    const chosen = market.data?.pools.find((p) => p.supported) ?? market.data?.pools[0];
    if (chosen) setPool(chosen.pairAddress);
  }, [market.data, pool]);
  const candles = useCandles(pool, address);
  const ms = PERIODS.find((p) => p.id === period)?.ms ?? 86_400_000;
  const all = candles.data ?? [];
  const { visible, baseline, covered } = chartWindow(all, now, ms);
  const currentPool = pools.find((p) => p.pairAddress.toLowerCase() === pool?.toLowerCase());
  const rawPrice = Number(currentPool?.priceUsd);
  const live = rawPrice > 0 && Number.isFinite(rawPrice) ? rawPrice : null;
  const last = all.at(-1);
  const price = live ?? last?.[4] ?? null;
  const change = covered && baseline != null && price != null ? (price / baseline - 1) * 100 : null;
  const up = (change ?? 0) >= 0;
  const W = 320, H = 140;
  const values = visible.map((c) => c[4]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const span = max - min;
  const xy = visible.map((c) => [((c[0] * 1000 - (now - ms)) / ms) * W, span ? H - 8 - ((c[4] - min) / span) * (H - 16) : H / 2] as const);
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fetching = market.isFetching || candles.isFetching;
  const stale = market.isError || !!market.data?.error || candles.isError;
  const refresh = () => { void market.refetch(); if (pool) void candles.refetch(); };
  return (
    <section aria-label={`Gráfico de ${symbol}`} className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-all text-xl font-bold">{symbol}</p>
        <div className="min-w-0 text-right">
          <p className="break-words font-mono text-xl font-bold">{price != null ? usd(price) : "—"}</p>
          <p className={cn("text-sm font-medium", change == null ? "text-muted-foreground" : up ? "text-success" : "text-destructive")}>
            {change != null ? `${up ? "+" : ""}${change.toFixed(2)}% · ${period}` : "Variação indisponível"}
          </p>
          {live == null && last && <p className="text-xs text-warning">Último preço do histórico · {time(last[0] * 1000)}</p>}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{market.data ? `Consulta: ${time(Date.parse(market.data.fetchedAt))}` : "Consultando preço…"}</span>
        <Button aria-label="Atualizar preço e gráfico" title="Atualizar preço e gráfico" variant="ghost" size="icon" disabled={fetching} onClick={refresh} className="h-7 w-7"><RefreshCw className={cn("h-3.5 w-3.5", fetching && "motion-safe:animate-spin")} /></Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Preço: consulta a cada 15s · Histórico: a cada 1 min</p>
      <div className="mt-3"><CandleChart candles={all} now={now} /></div>
      <div className="mt-3 grid grid-cols-4 gap-1">{PERIODS.map((p) => <Button key={p.id} size="sm" variant={period === p.id ? "secondary" : "ghost"} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.id}</Button>)}</div>
      {stale && <p role="status" className="mt-2 text-xs text-warning">Atualização indisponível. Os últimos dados recebidos foram mantidos; tentando novamente.</p>}
      {last && now - last[0] * 1000 > 20 * 60_000 && <p role="status" className="mt-2 text-xs text-warning">Gráfico com dados até {time(last[0] * 1000)} — buscando atualização. O preço acima continua ao vivo.</p>}
      {path && !covered && <p className="mt-2 text-xs text-muted-foreground">Histórico parcial neste período.</p>}
    </section>
  );
}
