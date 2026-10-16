import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarket } from "@/lib/chain.functions";
import { useCandles } from "@/hooks/useCandles";
import type { BotState } from "@/lib/autoStrategy";
import type { StrategyConfig } from "@/lib/strategy";
import { cn } from "@/lib/utils";

type Order = { side: string; status: string; token: string; created_at: string };
type Line = { price: number; label: string; tone: "buy" | "sell" | "stop" | "avg" | "grid" };

const TONE: Record<Line["tone"], string> = { buy: "text-success", sell: "text-primary", stop: "text-destructive", avg: "text-muted-foreground", grid: "text-muted-foreground" };
const usd = (n: number) => `US$ ${n.toPrecision(4)}`;

/** Robot trigger lines for the saved strategy (same rules as decide()). */
export function robotLines(cfg: StrategyConfig | null | undefined, s: BotState, high24h: number | null): Line[] {
  if (!cfg) return [];
  const out: Line[] = [];
  if (s.tokens > 0 && s.avgPriceUsd > 0) {
    out.push({ price: s.avgPriceUsd, label: "Preço médio", tone: "avg" });
    cfg.takeProfits.forEach((t, i) => { if (t.pct > 0 && !s.tpDone.includes(i)) out.push({ price: s.avgPriceUsd * (1 + t.pct / 100), label: `Venda ${i + 1} (+${t.pct}%)`, tone: "sell" }); });
    if (cfg.stopLossPct > 0) out.push({ price: s.avgPriceUsd * (1 - cfg.stopLossPct / 100), label: `Stop (-${cfg.stopLossPct}%)`, tone: "stop" });
  }
  if (cfg.entryType === "queda" && cfg.dropPct > 0 && s.entries < Math.max(1, cfg.maxEntries)) {
    let ref = cfg.referenceType === "manual" ? cfg.manualReference : high24h;
    if (s.entries > 0 && s.lastBuyUsd > 0) ref = ref ? Math.min(ref, s.lastBuyUsd) : s.lastBuyUsd;
    if (ref && ref > 0) out.push({ price: ref * (1 - cfg.dropPct / 100), label: `Compra abaixo daqui (-${cfg.dropPct}% do topo)`, tone: "buy" });
  }
  return out;
}

export function RobotVision(props: { token: string; symbol: string; cfg: StrategyConfig | null | undefined; state: BotState; mode: string; grid: number[]; orders: Order[]; armed: boolean; reason?: string | null | undefined }) {
  const { token, symbol, cfg, state, mode, grid, orders, armed, reason } = props;
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const market = useQuery({ queryKey: ["market", token], queryFn: () => getMarket({ data: { address: token } }), staleTime: 10_000, refetchInterval: 15_000, retry: 1 });
  const pool = market.data?.pools.find((p) => p.supported) ?? market.data?.pools[0];
  const candles = useCandles(pool?.pairAddress, token);
  const ms = 24 * 3_600_000;
  const all = (candles.data ?? []).filter((c) => c[0] * 1000 >= now - ms);
  const lastAt = candles.data?.length ? candles.data[candles.data.length - 1]![0] * 1000 : null;
  const live = Number(pool?.priceUsd) > 0 ? Number(pool?.priceUsd) : all.at(-1)?.[4] ?? null;
  const high = all.length ? Math.max(...all.map((c) => c[2])) : null;
  const lines: Line[] = mode === "grade" ? grid.map((p, i) => ({ price: p, label: i === 0 ? "Grade (base)" : i === grid.length - 1 ? "Grade (topo)" : "", tone: "grid" as const })) : robotLines(cfg, state, high);
  const trades = orders.filter((o) => o.status === "confirmada" && o.token.toLowerCase() === token.toLowerCase()).map((o) => {
    const t = Date.parse(o.created_at);
    const c = all.reduce<(typeof all)[number] | undefined>((b, x) => (!b || Math.abs(x[0] * 1000 - t) < Math.abs(b[0] * 1000 - t) ? x : b), undefined);
    return c && t >= now - ms ? { t, price: c[4], buy: o.side === "compra" } : null;
  }).filter((x): x is { t: number; price: number; buy: boolean } => !!x);

  const W = 320, H = 180;
  const vals = [...all.map((c) => c[4]), ...lines.map((l) => l.price), ...(live ? [live] : [])];
  const lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
  const pad = (hi - lo || hi || 1) * 0.08;
  const min = lo - pad, max = hi + pad;
  const y = (p: number) => H - ((p - min) / (max - min)) * H;
  const x = (t: number) => ((t - (now - ms)) / ms) * W;
  const path = all.map((c, i) => `${i ? "L" : "M"}${x(c[0] * 1000).toFixed(1)},${y(c[4]).toFixed(1)}`).join(" ");
  const buyLine = lines.find((l) => l.tone === "buy");
  const nextSell = lines.filter((l) => l.tone === "sell").sort((a, b) => a.price - b.price)[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{symbol} · últimas 24h</p>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", armed ? "text-success" : "text-muted-foreground")}>
          <span className={cn("h-2 w-2 rounded-full bg-current", armed && "motion-safe:animate-pulse")} />
          {armed ? "Robô vigiando" : "Robô desligado"}
        </span>
      </div>
      <div className="relative h-52 rounded-md border border-border bg-background/40 p-1">
        {path ? (
          <svg role="img" aria-label="Gráfico com os pontos do robô" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
            {lines.map((l, i) => (
              <g key={i} className={TONE[l.tone]}>
                <line x1={0} x2={W} y1={y(l.price)} y2={y(l.price)} stroke="currentColor" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={l.tone === "grid" ? 0.35 : 0.9} />
              </g>
            ))}
            <path d={path} fill="none" stroke="currentColor" className="text-foreground" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
            {trades.map((t, i) => (
              <circle key={i} cx={x(t.t)} cy={y(t.price)} r={4} className={t.buy ? "fill-success" : "fill-primary"} stroke="currentColor" />
            ))}
            {live && <circle cx={W} cy={y(live)} r={4} className="fill-warning motion-safe:animate-pulse" />}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{candles.isLoading || market.isLoading ? "Carregando gráfico…" : candles.isFetching ? "Buscando histórico…" : "Histórico ainda não disponível — tentando de novo sozinho"}</div>
        )}
        {path && lines.filter((l) => l.label).map((l, i) => (
          <span key={i} style={{ top: `calc(${(y(l.price) / H) * 100}% - 8px)` }} className={cn("pointer-events-none absolute left-2 rounded bg-card/90 px-1 text-[10px] font-medium", TONE[l.tone])}>{l.label} · {usd(l.price)}</span>
        ))}
      </div>
      {lastAt != null && now - lastAt > 20 * 60_000 && <p role="status" className="text-xs text-warning">Gráfico com dados até {new Date(lastAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — buscando atualização. O preço agora continua ao vivo.</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span><span className="text-warning">●</span> Preço agora</span>
        <span><span className="text-success">- -</span> Onde compra</span>
        <span><span className="text-primary">- -</span> Onde vende</span>
        <span><span className="text-destructive">- -</span> Stop (proteção)</span>
        <span><span className="text-success">●</span>/<span className="text-primary">●</span> Compras/vendas feitas</span>
      </div>
      {live != null && (
        <div className="rounded-md border border-border p-3 text-xs space-y-1">
          <p>Preço agora: <strong>{usd(live)}</strong></p>
          {buyLine && (live <= buyLine.price
            ? <p className="text-success">O preço já está <strong>abaixo</strong> do ponto de compra: para o robô, ele está "barato". A compra acontece na próxima verificação, se houver BNB suficiente.</p>
            : <p className="text-success">Falta {((live / buyLine.price - 1) * 100).toFixed(1)}% de queda para o robô comprar.</p>)}
          {nextSell && <p className="text-primary">Falta {Math.max(0, (nextSell.price / live - 1) * 100).toFixed(1)}% de alta para a próxima venda com lucro.</p>}
          {mode !== "grade" && cfg?.entryType === "medias" && <p className="text-muted-foreground">Esta estratégia compra quando a média curta cruza acima da longa — não existe um preço fixo; o robô avisa quando acontecer.</p>}
          {reason && <p className="text-muted-foreground">O robô está pensando: {reason}</p>}
        </div>
      )}
    </div>
  );
}
