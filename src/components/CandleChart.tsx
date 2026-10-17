import { useEffect, useState } from "react";
import type { Candle } from "@/lib/backtest";
import { aggregateCandles, engineSeries } from "@/lib/candleSeries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChartLevel = { price: number; label: string; tone: "buy" | "sell" | "stop" | "avg" | "grid" };
export type ChartTrade = { time: number; side: string; hash?: string | null | undefined; price?: number | null; details: string[] };
const tones = { buy: "text-success", sell: "text-primary", stop: "text-destructive", avg: "text-chart-4", grid: "text-muted-foreground" };
const windows = [{ id: "1h", hours: 1 }, { id: "4h", hours: 4 }, { id: "12h", hours: 12 }, { id: "1 dia", hours: 24 }];
const usd = (n: number) => n.toLocaleString("pt-BR", { maximumSignificantDigits: 5 });

export function CandleChart({ candles, now, strategyMinutes = 15, levels = [], trades = [] }: { candles: Candle[]; now: number; strategyMinutes?: number; levels?: ChartLevel[]; trades?: ChartTrade[] }) {
  const [minutes, setMinutes] = useState(5);
  const [hours, setHours] = useState(24);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ChartTrade | null>(null);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("cryptobot:chart-view") ?? "null"); if ([5, 15, 60].includes(saved?.minutes)) setMinutes(saved.minutes); if ([1, 4, 12, 24].includes(saved?.hours)) setHours(saved.hours); } catch { /* default */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem("cryptobot:chart-view", JSON.stringify({ minutes, hours })); } catch { /* unavailable */ } }, [minutes, hours, ready]);
  const start = now - hours * 3_600_000;
  const bars = aggregateCandles(candles, minutes, now).filter(b => b.candle[0] * 1000 >= start);
  const series = engineSeries(candles, strategyMinutes, now).filter(s => s.time >= start);
  const points = [...bars.flatMap(b => [b.candle[2], b.candle[3]]), ...levels.map(l => l.price), ...series.flatMap(s => [s.fast, s.slow].filter((v): v is number => v != null))];
  const low = points.length ? Math.min(...points) : 0, high = points.length ? Math.max(...points) : 1;
  const pad = (high - low || high || 1) * .08;
  const min = Math.max(0, low - pad), max = high + pad;
  const W = 760, H = 260, plot = 660;
  const x = (t: number) => (t - start) / (now - start || 1) * plot;
  const y = (p: number) => 12 + (max - p) / (max - min || 1) * (H - 24);
  const width = Math.max(1.2, Math.min(18, minutes * 60_000 / (now - start || 1) * plot * .7));
  const volumeMax = Math.max(0, ...bars.map(b => b.candle[5] ?? 0));
  const indicatorPath = (key: "fast" | "slow") => {
    let prev = 0;
    return series.map(s => { const value = s[key]; if (value == null) { prev = 0; return ""; } const move = !prev || s.time - prev > strategyMinutes * 60_000; prev = s.time; return `${move ? "M" : "L"}${x(s.time)},${y(value)}`; }).join(" ");
  };
  const visibleTrades = trades.filter(t => t.time >= start && t.time <= now);
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Velas</span>{[5, 15, 60].map(m => <Button key={m} size="sm" variant={minutes === m ? "secondary" : "ghost"} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m === 60 ? "1h" : `${m}m`}</Button>)}<span className="text-xs text-muted-foreground">Janela</span>{windows.map(w => <Button key={w.hours} size="sm" variant={hours === w.hours ? "secondary" : "ghost"} aria-pressed={hours === w.hours} onClick={() => setHours(w.hours)}>{w.id}</Button>)}</div>
    <p className="text-xs font-semibold">Gráfico: {minutes === 60 ? "1h" : `${minutes}m`} | Estratégia: {strategyMinutes === 60 ? "1h" : `${strategyMinutes}m`}</p>
    {bars.length ? <svg role="img" aria-label="Velas OHLCV, escala de preços e médias SMA do robô" viewBox={`0 0 ${W} 330`} className="w-full overflow-hidden">
      {[0, 1, 2, 3, 4].map(i => { const p = min + (max - min) * i / 4; return <g key={i} className="text-muted-foreground"><line x1={0} x2={plot} y1={y(p)} y2={y(p)} stroke="currentColor" opacity={.15} /><text x={plot + 8} y={y(p) + 4} fill="currentColor" fontSize={11}>{usd(p)}</text></g>; })}
      {levels.map((l, i) => <line key={i} x1={0} x2={plot} y1={y(l.price)} y2={y(l.price)} stroke="currentColor" strokeDasharray="5 4" className={tones[l.tone]} />)}
      {bars.map(({ candle: c, forming, complete }) => <g key={c[0]} className={c[4] >= c[1] ? "text-success" : "text-destructive"} opacity={forming || !complete ? .45 : 1}><title>{new Date(c[0] * 1000).toLocaleString("pt-BR")} · {forming ? "Em formação" : !complete ? "Vela incompleta" : "Fechada"} · A {usd(c[1])} / M {usd(c[2])} / m {usd(c[3])} / F {usd(c[4])} · Volume USD: {c[5] == null ? "indisponível" : usd(c[5])}</title><line x1={x(c[0] * 1000) + width / 2} x2={x(c[0] * 1000) + width / 2} y1={y(c[2])} y2={y(c[3])} stroke="currentColor" /><rect x={x(c[0] * 1000)} y={Math.min(y(c[1]), y(c[4]))} width={width} height={Math.max(1, Math.abs(y(c[1]) - y(c[4])))} fill="currentColor" />{c[5] != null && volumeMax > 0 && <rect x={x(c[0] * 1000)} y={310 - c[5] / volumeMax * 35} width={width} height={c[5] / volumeMax * 35} fill="currentColor" opacity={.5} />}</g>)}
      <path d={indicatorPath("fast")} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-primary" /><path d={indicatorPath("slow")} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-chart-4" />
      {visibleTrades.map((t, i) => { const nearby = bars.find(b => b.candle[0] * 1000 <= t.time && (b.candle[0] + minutes * 60) * 1000 > t.time); const price = t.price ?? nearby?.candle[4]; return price == null ? null : <g key={t.hash ?? i} className={t.side === "compra" ? "text-success" : "text-destructive"}><title>{t.side} · {t.hash} · {t.price == null ? "Posição vertical aproximada pelo histórico" : "Preço registrado"}</title><circle cx={x(t.time)} cy={y(price)} r={5} fill="currentColor" /><text x={x(t.time)} y={y(price) + (t.side === "compra" ? 17 : -10)} fill="currentColor" fontSize={10}>{t.side === "compra" ? "C" : "V"}</text></g>; })}
      <text x={0} y={328} fill="currentColor" fontSize={10} className="text-muted-foreground">{new Date(start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</text><text x={plot - 40} y={328} fill="currentColor" fontSize={10} className="text-muted-foreground">Agora</text>
    </svg> : <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">Histórico indisponível neste período.</p>}
    <p className="text-[11px] text-muted-foreground"><span className="text-primary">SMA 9</span> · <span className="text-chart-4">SMA 21</span> · USD · OHLCV do pool / GeckoTerminal · {bars.some(b => b.forming) ? "Última vela em formação" : "Sem vela atual"} · {volumeMax ? "Volume em USD" : "Volume indisponível"}</p>
    <p className="text-[11px] text-warning">Médias da regra real: fechamentos agrupados em {strategyMinutes}m; a regra antiga pode aceitar grupos incompletos. A candidata exige sequência completa e não comprime lacunas.</p>
    {levels.length > 0 && <ul className="grid gap-1 text-xs sm:grid-cols-2">{levels.filter(l => l.label).map((l, i) => <li key={i} className={tones[l.tone]}>{l.label}: US$ {usd(l.price)}</li>)}</ul>}
    {visibleTrades.length > 0 && <div className="flex flex-wrap gap-2">{visibleTrades.map((t, i) => <Button key={t.hash ?? i} size="sm" variant="outline" onClick={() => setSelected(t)} className={cn(t.side === "compra" ? "text-success" : "text-destructive")}>{t.side} · {new Date(t.time).toLocaleTimeString("pt-BR")}</Button>)}</div>}
    {selected && <div className="border-t border-border pt-3 text-xs"><p className="font-semibold">{selected.side} · {new Date(selected.time).toLocaleString("pt-BR")}</p>{selected.details.map((d, i) => <p key={i} className="mt-1 break-words">{d}</p>)}{selected.hash && <a href={`https://bscscan.com/tx/${selected.hash}`} target="_blank" rel="noreferrer" className="mt-1 block break-all text-primary underline">{selected.hash}</a>}</div>}
  </div>;
}