import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/backtest";
import { aggregateCandles, engineSeries, completeEngineSeries } from "@/lib/candleSeries";
import { Button } from "@/components/ui/button";
import { chartIndicators } from "@/lib/chartIndicators";
import { cn } from "@/lib/utils";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

export type ChartLevel = {
  price: number;
  label: string;
  tone: "buy" | "sell" | "stop" | "avg" | "grid";
};
export type ChartTrade = {
  time: number;
  side: string;
  hash?: string | null | undefined;
  price?: number | null;
  details: string[];
};
const tones = {
  buy: "text-success",
  sell: "text-primary",
  stop: "text-destructive",
  avg: "text-chart-4",
  grid: "text-muted-foreground",
};
const windows = [
  { id: "1h", hours: 1 },
  { id: "4h", hours: 4 },
  { id: "12h", hours: 12 },
  { id: "1 dia", hours: 24 },
];
const usd = (n: number) => n.toLocaleString("pt-BR", { maximumSignificantDigits: 5 });
const MIN_SPAN = 30 * 60_000; // 30 min — velas continuam legíveis
const MAX_SPAN = 26 * 3_600_000; // limite do histórico (~25h) com folga

type View = { start: number; end: number };

function ChartBody({
  candles,
  now,
  strategyMinutes = 15,
  rulesVersion = 1,
  fastLength = 9,
  slowLength = 21,
  levels = [],
  trades = [],
  tall = false,
}: {
  candles: Candle[];
  now: number;
  strategyMinutes?: number;
  rulesVersion?: 1 | 2;
  fastLength?: number;
  slowLength?: number;
  levels?: ChartLevel[];
  trades?: ChartTrade[];
  tall?: boolean;
}) {
  const [minutes, setMinutes] = useState(5);
  const [height, setHeight] = useState(tall ? 420 : 320);
  const [mode, setMode] = useState("candles");
  const [showSma, setShowSma] = useState(true);
  const [technical, setTechnical] = useState(false);
  const indicators = useMemo(() => chartIndicators(candles, minutes, now), [candles, minutes, now]);
  const [hours, setHours] = useState(24);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ChartTrade | null>(null);
  const [follow, setFollow] = useState(true);
  const [view, setView] = useState<View | null>(null);
  const [probe, setProbe] = useState<{ t: number; px: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stateRef = useRef({ view, follow, hours, now, minutes });
  stateRef.current = { view, follow, hours, now, minutes };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; span: number; anchorT: number } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cryptobot:chart-view") ?? "null");
      if ([5, 15, 60].includes(saved?.minutes)) setMinutes(saved.minutes);
      if ([1, 4, 12, 24].includes(saved?.hours)) setHours(saved.hours);
    } catch {
      /* default */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("cryptobot:chart-view", JSON.stringify({ minutes, hours }));
      } catch {
        /* unavailable */
      }
  }, [minutes, hours, ready]);

  // Enquadramento previsível: seguir o presente dentro da janela escolhida.
  const frame = useCallback(
    (h: number) => ({ start: stateRef.current.now - h * 3_600_000, end: stateRef.current.now }),
    [],
  );
  useEffect(() => {
    if (follow) setView(frame(hours));
  }, [follow, hours, now, frame]);

  const v: View = view ?? frame(hours);
  const span = v.end - v.start;
  const clampView = (next: View): View => {
    const s = Math.min(MAX_SPAN, Math.max(MIN_SPAN, next.end - next.start));
    const k = s / (next.end - next.start || 1);
    const mid = (next.start + next.end) / 2;
    return { start: mid - (s / 2) * (k || 1), end: mid + (s / 2) * (k || 1) };
  };
  const zoomAt = (anchorT: number, factor: number) => {
    const cur = stateRef.current.view ?? frame(stateRef.current.hours);
    const ns = clampView({
      start: anchorT - (anchorT - cur.start) * factor,
      end: anchorT + (cur.end - anchorT) * factor,
    });
    setView(ns);
    setFollow(false);
  };
  const panBy = (dt: number) => {
    const cur = stateRef.current.view ?? frame(stateRef.current.hours);
    const ns = { start: cur.start + dt, end: cur.end + dt };
    setView(ns);
    setFollow(Math.abs(ns.end - stateRef.current.now) < stateRef.current.minutes * 60_000);
  };

  // Zoom pela roda apenas com o gráfico em foco (listener nativo não-passivo).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cur = stateRef.current.view ?? frame(stateRef.current.hours);
      const anchorT = cur.start + ((e.clientX - rect.left) / rect.width) * (cur.end - cur.start);
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      zoomAt(anchorT, Math.exp(dy * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [frame]);

  const bars = useMemo(() => aggregateCandles(candles, minutes, now), [candles, minutes, now]);
  const series = useMemo(
    () =>
      (rulesVersion === 2 ? completeEngineSeries : engineSeries)(
        candles,
        strategyMinutes,
        now,
        fastLength,
        slowLength,
      ),
    [candles, strategyMinutes, now, fastLength, slowLength, rulesVersion],
  );
  const visibleBars = bars.filter(
    (b) => (b.candle[0] + minutes * 60) * 1000 > v.start && b.candle[0] * 1000 < v.end,
  );
  const visibleSeries = series.filter((s) => s.time >= v.start && s.time <= v.end);
  const visibleTrades = trades.filter((t) => t.time >= v.start && t.time <= v.end);

  // Escala vertical recalculada a partir do trecho visível — picos nunca são cortados.
  const points = [
    ...visibleBars.flatMap((b) => [b.candle[2], b.candle[3]]),
    ...levels.filter((l) => l.price > 0).map((l) => l.price),
    ...visibleSeries.flatMap((s) => [s.fast, s.slow].filter((x): x is number => x != null)),
  ];
  const low = points.length ? Math.min(...points) : 0,
    high = points.length ? Math.max(...points) : 1;
  const pad = (high - low || high || 1) * 0.08;
  const min = Math.max(0, low - pad),
    max = high + pad;

  const W = 760,
    H = height,
    plot = 640,
    labelW = W - plot;
  const x = (t: number) => ((t - v.start) / (span || 1)) * plot;
  const y = (p: number) => 12 + ((max - p) / (max - min || 1)) * (H - 24);
  const width = Math.max(1.5, Math.min(22, ((minutes * 60_000) / (span || 1)) * plot * 0.7));
  const volumeMax = Math.max(0, ...visibleBars.map((b) => b.candle[5] ?? 0));
  const volBase = H + 56;
  const historyStart = bars.length ? (bars[0]?.candle[0] ?? 0) * 1000 : null;
  const atHistoryLimit = historyStart != null && v.start <= historyStart + 1;

  const indicatorPath = (key: "fast" | "slow") => {
    let prev = 0;
    return visibleSeries
      .map((s) => {
        const value = s[key];
        if (value == null) {
          prev = 0;
          return "";
        }
        const move = !prev || s.time - prev > strategyMinutes * 60_000;
        prev = s.time;
        return `${move ? "M" : "L"}${x(s.time)},${y(value)}`;
      })
      .join(" ");
  };

  const tFromEvent = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return v.start + ((clientX - rect.left) / rect.width) * span;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0],
        b = pts[1];
      if (!a || !b) return;
      const cur = stateRef.current.view ?? frame(stateRef.current.hours);
      pinch.current = {
        dist: Math.abs(a.x - b.x) || 1,
        span: cur.end - cur.start,
        anchorT: tFromEvent((a.x + b.x) / 2) ?? (cur.start + cur.end) / 2,
      };
      if (longPress.current) clearTimeout(longPress.current);
    } else if (e.pointerType === "touch") {
      const t = tFromEvent(e.clientX);
      longPress.current = setTimeout(() => {
        if (t != null) setProbe({ t, px: e.clientX });
      }, 500);
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (prev) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0],
        b = pts[1];
      if (!a || !b) return;
      const factor = pinch.current.dist / (Math.abs(a.x - b.x) || 1);
      const p = pinch.current;
      setView(
        clampView({
          start: p.anchorT - (p.span * factor) / 2,
          end: p.anchorT + (p.span * factor) / 2,
        }),
      );
      setFollow(false);
      return;
    }
    if (prev && pointers.current.size === 1 && e.pointerType === "touch") {
      const dx = e.clientX - prev.x;
      if (Math.abs(dx) > 6 && longPress.current) {
        clearTimeout(longPress.current);
        longPress.current = null;
      }
      if (Math.abs(dx) > Math.abs(e.clientY - prev.y))
        panBy((-dx / (svgRef.current?.getBoundingClientRect().width || 1)) * span);
      return;
    }
    if (prev && pointers.current.size === 1 && e.pointerType === "mouse" && e.buttons === 1) {
      panBy((-(e.clientX - prev.x) / (svgRef.current?.getBoundingClientRect().width || 1)) * span);
      return;
    }
    if (e.pointerType === "mouse") {
      const t = tFromEvent(e.clientX);
      if (t != null) setProbe({ t, px: e.clientX });
    }
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
    if (e.pointerType === "touch") setTimeout(() => setProbe(null), 4000);
  };

  const probeBar = probe
    ? visibleBars.find(
        (b) => b.candle[0] * 1000 <= probe.t && (b.candle[0] + minutes * 60) * 1000 > probe.t,
      )
    : null;
  const probeSeries = probe
    ? visibleSeries.find((s) => Math.abs(s.time - probe.t) < strategyMinutes * 60_000)
    : null;

  const focusTrade = (t: ChartTrade) => {
    setSelected(t);
    const half = Math.max(MIN_SPAN, minutes * 60_000 * 12) / 2;
    setView(clampView({ start: t.time - half, end: t.time + half }));
    setFollow(false);
  };

  const fmtTime = (t: number) =>
    new Date(t).toLocaleString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      timeZoneName: "short",
    });

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Velas</span>
        {[5, 15, 60].map((m) => (
          <Button
            key={m}
            size="sm"
            variant={minutes === m ? "secondary" : "ghost"}
            aria-pressed={minutes === m}
            onClick={() => setMinutes(m)}
          >
            {m === 60 ? "1h" : `${m}m`}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">Janela</span>
        {windows.map((w) => (
          <Button
            key={w.hours}
            size="sm"
            variant={hours === w.hours ? "secondary" : "ghost"}
            aria-pressed={hours === w.hours}
            onClick={() => {
              setHours(w.hours);
              setFollow(true);
            }}
          >
            {w.id}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label="Ampliar zoom"
          onClick={() => zoomAt((v.start + v.end) / 2, 0.7)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label="Reduzir zoom"
          onClick={() => zoomAt((v.start + v.end) / 2, 1 / 0.7)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFollow(true);
            setView(frame(hours));
          }}
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          Restaurar
        </Button>
        {follow ? (
          <span className="text-xs text-success">Acompanhar últimas velas: ativo</span>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setFollow(true)}>
            Voltar ao tempo real
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label>
          Visualização{" "}
          <select
            aria-label="Visualização do gráfico"
            className="rounded border border-border bg-background p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="candles">Velas</option>
            <option value="line">Linha de fechamento</option>
          </select>
        </label>
        <label>
          Altura{" "}
          <select
            aria-label="Altura do gráfico"
            className="rounded border border-border bg-background p-2"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          >
            <option value={260}>Compacto</option>
            <option value={320}>Padrão</option>
            <option value={420}>Grande</option>
            <option value={560}>Extra grande</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showSma} onChange={(e) => setShowSma(e.target.checked)} />{" "}
          Médias do robô
        </label>
        <Button
          size="sm"
          variant={technical ? "secondary" : "outline"}
          aria-pressed={technical}
          onClick={() => setTechnical(!technical)}
        >
          Indicadores técnicos
        </Button>
      </div>
      {technical && (
        <section
          aria-label="Indicadores técnicos"
          className="rounded-md border border-border p-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              RSI (14)
              <p className="mt-1 font-mono text-base">
                {indicators.rsi == null ? "—" : indicators.rsi.toFixed(2)}
              </p>
            </div>
            <div>
              EMA (20)
              <p className="mt-1 font-mono text-base">
                {indicators.ema == null ? "—" : `US$ ${usd(indicators.ema)}`}
              </p>
            </div>
            <div>
              ATR (14)
              <p className="mt-1 font-mono text-base">
                {indicators.atr == null ? "—" : `US$ ${usd(indicators.atr)}`}
              </p>
            </div>
            <div>
              Velas válidas<p className="mt-1 font-mono text-base">{indicators.count}</p>
            </div>
          </div>
          <p className="mt-2 text-muted-foreground">
            Intervalo {minutes}m · apenas velas fechadas e completas desde a última lacuna. RSI/ATR
            exigem 15 velas; EMA exige 20. RSI: força relativa; EMA: tendência; ATR: amplitude de
            oscilação. Indicadores visuais não alteram o robô e não são sinais automáticos de compra
            ou venda.
          </p>
        </section>
      )}
      <p className="text-xs font-semibold">
        Gráfico: {minutes === 60 ? "1h" : `${minutes}m`} | Estratégia:{" "}
        {strategyMinutes === 60 ? "1h" : `${strategyMinutes}m`}
      </p>
      {atHistoryLimit && <p className="text-xs text-warning">Limite do histórico disponível.</p>}
      {bars.length ? (
        <svg
          ref={svgRef}
          role="img"
          aria-label="Velas OHLCV, escala de preços e médias SMA do robô"
          viewBox={`0 0 ${W} ${volBase + 20}`}
          className="w-full touch-pan-y select-none overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            if (pointers.current.size === 0) setProbe(null);
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const p = min + ((max - min) * i) / 4;
            return (
              <g key={i} className="text-muted-foreground">
                <line x1={0} x2={plot} y1={y(p)} y2={y(p)} stroke="currentColor" opacity={0.15} />
                <text x={plot + 8} y={y(p) + 4} fill="currentColor" fontSize={12}>
                  {usd(p)}
                </text>
              </g>
            );
          })}
          {levels.map((l, i) => (
            <line
              key={i}
              x1={0}
              x2={plot}
              y1={y(l.price)}
              y2={y(l.price)}
              stroke="currentColor"
              strokeDasharray="5 4"
              className={tones[l.tone]}
            />
          ))}
          {mode === "line" && (
            <path
              d={visibleBars
                .map(
                  (b, i) =>
                    `${i === 0 || b.candle[0] !== (visibleBars[i - 1]?.candle[0] ?? 0) + minutes * 60 ? "M" : "L"}${x(b.candle[0] * 1000)},${y(b.candle[4])}`,
                )
                .join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="text-primary"
            />
          )}
          {visibleBars.map(({ candle: c, forming, complete }) => (
            <g
              key={c[0]}
              className={c[4] >= c[1] ? "text-success" : "text-destructive"}
              opacity={forming || !complete ? 0.45 : 1}
            >
              <title>
                {new Date(c[0] * 1000).toLocaleString("pt-BR")} ·{" "}
                {forming ? "Em formação" : !complete ? "Vela incompleta" : "Fechada"} · A{" "}
                {usd(c[1])} / M {usd(c[2])} / m {usd(c[3])} / F {usd(c[4])} · Volume USD:{" "}
                {c[5] == null ? "indisponível" : usd(c[5])}
              </title>
              <line
                visibility={mode === "candles" ? "visible" : "hidden"}
                x1={x(c[0] * 1000) + width / 2}
                x2={x(c[0] * 1000) + width / 2}
                y1={y(c[2])}
                y2={y(c[3])}
                stroke="currentColor"
              />
              <rect
                visibility={mode === "candles" ? "visible" : "hidden"}
                x={x(c[0] * 1000)}
                y={Math.min(y(c[1]), y(c[4]))}
                width={width}
                height={Math.max(1, Math.abs(y(c[1]) - y(c[4])))}
                fill="currentColor"
              />
              {c[5] != null && volumeMax > 0 && (
                <rect
                  x={x(c[0] * 1000)}
                  y={volBase - (c[5] / volumeMax) * 40}
                  width={width}
                  height={(c[5] / volumeMax) * 40}
                  fill="currentColor"
                  opacity={0.5}
                />
              )}
            </g>
          ))}
          <path
            visibility={showSma ? "visible" : "hidden"}
            d={indicatorPath("fast")}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-primary"
          />
          <path
            visibility={showSma ? "visible" : "hidden"}
            d={indicatorPath("slow")}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-chart-4"
          />
          {visibleTrades.map((t, i) => {
            const nearby = visibleBars.find(
              (b) => b.candle[0] * 1000 <= t.time && (b.candle[0] + minutes * 60) * 1000 > t.time,
            );
            const price = t.price ?? nearby?.candle[4];
            return price == null ? null : (
              <g
                key={t.hash ?? i}
                className={t.side === "compra" ? "text-success" : "text-destructive"}
              >
                <title>
                  {t.side} · {t.hash} ·{" "}
                  {t.price == null
                    ? "Posição vertical aproximada pelo histórico"
                    : "Preço registrado"}
                </title>
                <circle cx={x(t.time)} cy={y(price)} r={5} fill="currentColor" />
                <text
                  x={x(t.time)}
                  y={y(price) + (t.side === "compra" ? 17 : -10)}
                  fill="currentColor"
                  fontSize={11}
                >
                  {t.side === "compra" ? "C" : "V"}
                </text>
              </g>
            );
          })}
          {probe && (
            <line
              x1={x(probe.t)}
              x2={x(probe.t)}
              y1={0}
              y2={volBase}
              stroke="currentColor"
              opacity={0.4}
              className="text-foreground"
            />
          )}
          <text
            x={0}
            y={volBase + 16}
            fill="currentColor"
            fontSize={11}
            className="text-muted-foreground"
          >
            {new Date(v.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </text>
          <text
            x={plot - 90}
            y={volBase + 16}
            fill="currentColor"
            fontSize={11}
            className="text-muted-foreground"
          >
            {follow
              ? "Agora"
              : new Date(v.end).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </text>
        </svg>
      ) : (
        <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Histórico indisponível neste período.
        </p>
      )}
      {probe && probeBar && (
        <div className="rounded-md border border-border p-2 text-xs">
          <p className="font-semibold">{fmtTime(probeBar.candle[0] * 1000)}</p>
          <p>
            A {usd(probeBar.candle[1])} · M {usd(probeBar.candle[2])} · m {usd(probeBar.candle[3])}{" "}
            · F {usd(probeBar.candle[4])}
          </p>
          <p>
            Volume USD: {probeBar.candle[5] == null ? "indisponível" : usd(probeBar.candle[5])} ·
            SMA {fastLength}: {probeSeries?.fast != null ? usd(probeSeries.fast) : "indisponível"} ·
            SMA {slowLength}: {probeSeries?.slow != null ? usd(probeSeries.slow) : "indisponível"}
          </p>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        <span className="text-primary">SMA {fastLength}</span> ·{" "}
        <span className="text-chart-4">SMA {slowLength}</span> · USD · OHLCV do pool / GeckoTerminal
        · {bars.some((b) => b.forming) ? "Última vela em formação" : "Sem vela atual"} ·{" "}
        {volumeMax ? "Volume em USD" : "Volume indisponível"}
      </p>
      <p className="text-[11px] text-warning">
        Médias da regra real: fechamentos agrupados em {strategyMinutes}m; a regra antiga pode
        aceitar grupos incompletos. A candidata exige sequência completa e não comprime lacunas.
      </p>
      {levels.length > 0 && (
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {levels
            .filter((l) => l.label)
            .map((l, i) => (
              <li key={i} className={tones[l.tone]}>
                {l.label}: US$ {usd(l.price)}
              </li>
            ))}
        </ul>
      )}
      {trades.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trades.map((t, i) => (
            <Button
              key={t.hash ?? i}
              size="sm"
              variant="outline"
              onClick={() => focusTrade(t)}
              className={cn(t.side === "compra" ? "text-success" : "text-destructive")}
            >
              {t.side} · {new Date(t.time).toLocaleTimeString("pt-BR")}
            </Button>
          ))}
        </div>
      )}
      {selected && (
        <div className="border-t border-border pt-3 text-xs">
          <p className="font-semibold">
            {selected.side} · {new Date(selected.time).toLocaleString("pt-BR")}
          </p>
          {selected.details.map((d, i) => (
            <p key={i} className="mt-1 break-words">
              {d}
            </p>
          ))}
          {selected.hash && (
            <a
              href={`https://bscscan.com/tx/${selected.hash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-primary underline"
            >
              {selected.hash}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function CandleChart(props: {
  candles: Candle[];
  now: number;
  strategyMinutes?: number;
  rulesVersion?: 1 | 2;
  fastLength?: number;
  slowLength?: number;
  levels?: ChartLevel[];
  trades?: ChartTrade[];
}) {
  const [expanded, setExpanded] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const openExpanded = async () => {
    setExpanded(true);
    try {
      await overlayRef.current?.requestFullscreen?.();
    } catch {
      /* modal serve como alternativa */
    }
  };
  const closeExpanded = () => {
    setExpanded(false);
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={openExpanded}>
          <Maximize2 className="mr-1 h-4 w-4" />
          Ampliar gráfico
        </Button>
      </div>
      <ChartBody {...props} />
      {expanded && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 overflow-auto bg-background p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Gráfico ampliado"
        >
          <div className="mb-2 flex justify-end">
            <Button size="sm" variant="secondary" onClick={closeExpanded}>
              <X className="mr-1 h-4 w-4" />
              Fechar
            </Button>
          </div>
          <ChartBody {...props} tall />
        </div>
      )}
    </div>
  );
}
