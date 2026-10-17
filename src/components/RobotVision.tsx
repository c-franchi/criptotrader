import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarket } from "@/lib/chain.functions";
import { useCandles } from "@/hooks/useCandles";
import { closesAt, readRegime, intervalMinutes, referenceHigh, type BotState } from "@/lib/autoStrategy";
import type { StrategyConfig } from "@/lib/strategy";
import { cn } from "@/lib/utils";
import { stopPrice, netPositionPct } from "@/lib/stopLoss";
import { CandleChart } from "@/components/CandleChart";
import { OrderAudit } from "@/components/OrderAudit";
import { decide } from "@/lib/autoStrategy";

type Order = { side: string; status: string; token: string; created_at: string; tx_hash?: string | null; amount_in?: string; quoted_out?: string };
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
    const stop = stopPrice(s.avgPriceUsd, cfg);
    if (stop != null) out.push({ price: stop, label: cfg.stopLossMode === "liquido" ? `Stop líquido (-${cfg.stopLossPct}%)` : `Stop (-${cfg.stopLossPct}% preço)`, tone: "stop" });
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
  const lastAt = candles.data?.at(-1)?.[0] != null ? (candles.data.at(-1)?.[0] ?? 0) * 1000 : null;
  const live = Number(pool?.priceUsd) > 0 ? Number(pool?.priceUsd) : all.at(-1)?.[4] ?? null;
  const high = candles.data?.length ? referenceHigh(candles.data, (now - (cfg?.windowHours ?? 24) * 3_600_000) / 1000) : null;
  const slowAvg = (() => {
    if (!cfg || cfg.entryType !== "medias" || !candles.data) return null;
    const cl = closesAt(candles.data, intervalMinutes(cfg.candleInterval), now || Date.now());
    if (cl.length < cfg.maSlow) return null;
    const f = cl.slice(-cfg.maFast).reduce((a, b) => a + b, 0) / cfg.maFast, s = cl.slice(-cfg.maSlow).reduce((a, b) => a + b, 0) / cfg.maSlow;
    return { f, s, up: f > s };
  })();
  const regime = (() => {
    if (!cfg || cfg.entryType !== "adaptativa" || !candles.data) return null;
    return readRegime(cfg, closesAt(candles.data, intervalMinutes(cfg.candleInterval), now || Date.now()));
  })();
  const adaptLines: Line[] = [];
  if (regime && cfg) {
    if (state.tokens > 0 && state.avgPriceUsd > 0) adaptLines.push({ price: state.avgPriceUsd * (1 + regime.targetGrossPct / 100), label: `Venda (+${regime.targetGrossPct.toFixed(1)}%, já com taxas)`, tone: "sell" });
    else if (state.entries < Math.max(1, cfg.maxEntries)) {
      if (regime.kind === "lateral" && regime.rangePct >= regime.targetGrossPct) adaptLines.push({ price: regime.lo + (regime.hi - regime.lo) * 0.25, label: "Compra abaixo daqui (fundo da faixa)", tone: "buy" });
      if (regime.kind === "alta") adaptLines.push({ price: regime.slow, label: "Compra abaixo daqui (média)", tone: "buy" });
    }
  }
  const lines: Line[] = mode === "grade" ? grid.map((p, i) => ({ price: p, label: i === 0 ? "Grade (base)" : i === grid.length - 1 ? "Grade (topo)" : "", tone: "grid" as const })) : [...robotLines(cfg, state, high), ...adaptLines, ...(slowAvg?.up && state.entries < Math.max(1, cfg?.maxEntries ?? 1) ? [{ price: slowAvg.s, label: `Compra abaixo daqui (média de ${cfg?.maSlow})`, tone: "buy" as const }] : [])];
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
      <CandleChart candles={candles.data ?? []} now={now} strategyMinutes={intervalMinutes(cfg?.candleInterval ?? "15m")} levels={lines} trades={orders.filter(o => o.status === "confirmada" && o.token.toLowerCase() === token.toLowerCase()).map(o => ({ time: Date.parse(o.created_at), side: o.side, hash: o.tx_hash, details: ["Reconstruído: horário do registro; consulte o comprovante para horário da transação e quantidades efetivas.", `Valor de entrada registrado (unidades mínimas): ${o.amount_in ?? "indisponível"}`, "Preço vertical aproximado pelo histórico; não é preço efetivo de execução.", "Sinal, versão e parâmetros antigos não foram registrados; não são reconstruídos a partir da estratégia atual."] }))} />
      <OrderAudit hashes={orders.filter(o => o.token.toLowerCase() === token.toLowerCase()).flatMap(o => o.tx_hash ? [o.tx_hash] : [])} />
      {cfg && live != null && <div className="border-t border-border pt-3 text-xs"><p className="font-semibold">Por que o bot está esperando?</p><p>{armed ? decide(cfg, state, { priceUsd: live, liquidityUsd: pool?.liquidityUsd ?? null, high, closes: closesAt(candles.data ?? [], intervalMinutes(cfg.candleInterval), now), now }).reason : "Robô desligado"}</p><p className="text-muted-foreground">Prévia atual às {new Date(now).toLocaleTimeString("pt-BR")} · {cfg.candleInterval}. Última avaliação do servidor: {reason ?? "indisponível"}. Cooldown restante: {Math.max(0, Math.ceil((state.lastTradeAt + cfg.cooldownMin * 60_000 - now) / 60_000))} min.</p><p className="text-warning">A condição visual não garante execução. Recuperação e rearme novos estão disponíveis somente na simulação.</p></div>}
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
          {mode !== "grade" && cfg?.stopLossMode === "liquido" && state.tokens > 0 && state.avgPriceUsd > 0 && <p className="text-warning">Resultado líquido estimado: {netPositionPct(live, state.avgPriceUsd, cfg).toFixed(1)}% · limite de perda: {cfg.stopLossPct}%. Inclui taxas do token; não inclui gás nem variação da execução. O stop vende a posição, mas o robô continua ligado e os saques continuam disponíveis.</p>}
          {buyLine && (live <= buyLine.price
            ? <p className="text-success">O preço já está <strong>abaixo</strong> do ponto de compra: para o robô, ele está "barato". A compra acontece na próxima verificação, se houver BNB suficiente.</p>
            : <p className="text-success">Falta {((live / buyLine.price - 1) * 100).toFixed(1)}% de queda para o robô comprar.</p>)}
          {nextSell && <p className="text-primary">Falta {Math.max(0, (nextSell.price / live - 1) * 100).toFixed(1)}% de alta para a próxima venda com lucro.</p>}
          {mode !== "grade" && cfg?.entryType === "medias" && <p className="text-muted-foreground">{slowAvg?.up ? "Tendência de alta: o robô compra quando o preço recuar até a linha verde (a média)." : "Tendência de queda: o robô não compra enquanto o preço cai. A linha de compra aparece quando a tendência virar para alta."}</p>}
          {mode !== "grade" && cfg?.entryType === "adaptativa" && <p className="text-muted-foreground">{!regime ? "Juntando histórico para reconhecer o padrão do preço…" : regime.kind === "lateral" ? (regime.rangePct >= regime.targetGrossPct ? `Padrão: preço parado (faixa de ${regime.rangePct.toFixed(1)}%). O robô compra no fundo da faixa e vende com ganho curto.` : `Padrão: preço parado, mas a faixa (${regime.rangePct.toFixed(1)}%) não paga as taxas (${regime.targetGrossPct.toFixed(1)}%). O robô não entra.`) : regime.kind === "alta" ? "Padrão: alta. O robô compra quando o preço recuar até a linha verde (a média)." : "Padrão: queda. O robô não compra enquanto o preço cai."}</p>}
          {reason && <p className="text-muted-foreground">O robô está pensando: {reason}</p>}
        </div>
      )}
      {live != null && all.length > 1 && (() => {
        const closes = all.map((c) => c[4]);
        const lo24 = Math.min(...all.map((c) => c[3])), hi24 = Math.max(...all.map((c) => c[2]));
        const pos = hi24 > lo24 ? Math.min(100, Math.max(0, ((live - lo24) / (hi24 - lo24)) * 100)) : 50;
        const at = (minAgo: number) => all.reduce((b, c) => (Math.abs(c[0] * 1000 - (now - minAgo * 60_000)) < Math.abs(b[0] * 1000 - (now - minAgo * 60_000)) ? c : b), all[0]!)[4];
        const pct = (a: number) => ((live / a - 1) * 100);
        const ch = [{ l: "15 min", v: pct(at(15)) }, { l: "1h", v: pct(at(60)) }, { l: "6h", v: pct(at(360)) }, { l: "24h", v: pct(closes[0]!) }];
        const zone = pos < 25 ? { t: "Perto da mínima do dia (preço baixo)", c: "text-success" } : pos > 75 ? { t: "Perto da máxima do dia (preço alto)", c: "text-destructive" } : { t: "No meio da faixa do dia", c: "text-warning" };
        const recent = closes.slice(-12);
        const vol = recent.length > 1 ? ((Math.max(...recent) - Math.min(...recent)) / Math.min(...recent)) * 100 : 0;
        const entriesLeft = state.entries < Math.max(1, cfg?.maxEntries ?? 1);
        const checks: { ok: boolean; t: string }[] = [];
        if (mode !== "grade" && cfg) {
          checks.push({ ok: armed, t: armed ? "Robô ligado" : "Robô desligado" });
          checks.push({ ok: entriesLeft, t: `Compras feitas: ${state.entries} de ${Math.max(1, cfg.maxEntries)}` });
          if (cfg.entryType === "medias") {
            checks.push({ ok: !!slowAvg?.up, t: slowAvg ? (slowAvg.up ? "Tendência de alta (média rápida acima da lenta)" : "Tendência de queda (média rápida abaixo da lenta)") : "Calculando médias…" });
            if (slowAvg) checks.push({ ok: live <= slowAvg.s, t: live <= slowAvg.s ? "Preço recuou até a média" : `Preço ${pct(slowAvg.s).toFixed(1)}% acima da média lenta` });
          } else if (cfg.entryType === "adaptativa") {
            checks.push({ ok: !!regime && regime.kind !== "queda", t: !regime ? "Reconhecendo o padrão…" : regime.kind === "lateral" ? "Padrão: preço parado" : regime.kind === "alta" ? "Padrão: alta" : "Padrão: queda (não compra)" });
            if (regime?.kind === "lateral") checks.push({ ok: regime.rangePct >= regime.targetGrossPct, t: `Faixa ${regime.rangePct.toFixed(1)}% ${regime.rangePct >= regime.targetGrossPct ? "paga" : "não paga"} as taxas (precisa ${regime.targetGrossPct.toFixed(1)}%)` });
            if (buyLine) checks.push({ ok: live <= buyLine.price, t: live <= buyLine.price ? "Preço no ponto de compra" : `Faltam ${((live / buyLine.price - 1) * 100).toFixed(1)}% de queda` });
            if (regime) checks.push({ ok: true, t: `Meta de lucro: ~${regime.targetNetPct}% líquido (preço precisa subir ${regime.targetGrossPct.toFixed(1)}%)` });
          } else if (buyLine) {
            checks.push({ ok: live <= buyLine.price, t: live <= buyLine.price ? "Preço abaixo do ponto de compra" : `Faltam ${((live / buyLine.price - 1) * 100).toFixed(1)}% de queda` });
          }
        }
        return (
          <div className="rounded-md border border-border p-3 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Análise em tempo real</p>
              <span className="text-[10px] text-muted-foreground">atualiza a cada 15s{now ? ` · ${new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</span>
            </div>
            <div>
              <p className="mb-1 text-muted-foreground">Faixa de preço das últimas 24h</p>
              <div className="relative h-2 rounded-full bg-gradient-to-r from-success/60 via-warning/60 to-destructive/60">
                <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground" style={{ left: `${pos}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>Mín {usd(lo24)}</span><span>Máx {usd(hi24)}</span></div>
              <p className={cn("mt-1 font-medium", zone.c)}>{zone.t} · {pos.toFixed(0)}% da faixa</p>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {ch.map((c) => (
                <div key={c.l} className="rounded bg-background/50 p-1.5">
                  <p className="text-[10px] text-muted-foreground">{c.l}</p>
                  <p className={cn("font-mono font-semibold", c.v >= 0 ? "text-success" : "text-destructive")}>{c.v >= 0 ? "+" : ""}{c.v.toFixed(1)}%</p>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground">Agitação na última hora: <strong className={vol > 5 ? "text-warning" : "text-foreground"}>{vol.toFixed(1)}%</strong> {vol > 5 ? "(preço oscilando bastante)" : "(preço calmo)"}</p>
            {slowAvg && cfg && (
              <p className="text-muted-foreground">Média rápida ({cfg.maFast}): <strong className="text-foreground">{usd(slowAvg.f)}</strong> · Média lenta ({cfg.maSlow}): <strong className="text-foreground">{usd(slowAvg.s)}</strong></p>
            )}
            {checks.length > 0 && (
              <div>
                <p className="mb-1 text-muted-foreground">O que o robô confere antes de comprar:</p>
                <ul className="space-y-0.5">
                  {checks.map((c, i) => <li key={i} className={c.ok ? "text-success" : "text-muted-foreground"}>{c.ok ? "✓" : "○"} {c.t}</li>)}
                </ul>
                <p className="mt-1 font-medium">{checks.every((c) => c.ok) ? "Tudo certo: o robô compra na próxima verificação." : "Ainda não: o robô espera todas as condições ficarem ✓."}</p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
