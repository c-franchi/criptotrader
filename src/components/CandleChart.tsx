import { FiatValue } from "@/hooks/useCurrency";
import { formatPrice } from "@/lib/display";
import { technicalSeries } from "@/lib/technicalSeries";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/marketStats";
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
  id?: string;
  time: number;
  side: string;
  hash?: string | null | undefined;
  price?: number | null;
  details: string[];
};
const tones = {
  buy: "text-success",
  sell: "text-destructive",
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
const usd = formatPrice;
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
  alignStrategy = false,
  liveQuote,
  compact = false,
  preferenceKey,
  minimal = false,
  focusRequest,
  fitTradeIds = [],
}: {
  candles: Candle[];
  now: number;
  strategyMinutes?: number;
  rulesVersion?: 1 | 2;
  fastLength?: number;
  slowLength?: number;
  levels?: ChartLevel[];
  trades?: ChartTrade[];
  focusRequest?: { id: string; request: number } | null;
  fitTradeIds?: string[];
  tall?: boolean;
  alignStrategy?: boolean;
  liveQuote?: { price: number; at: number } | undefined;
  compact?: boolean;
  preferenceKey?: string;
  minimal?: boolean;
}) {
  const [minutes, setMinutes] = useState(compact ? 30 : alignStrategy ? strategyMinutes : 5);
  const [height, setHeight] = useState(tall ? 420 : 320);
  const [mode, setMode] = useState("candles");
  const [showSma, setShowSma] = useState(!compact);
  const [controls, setControls] = useState(false);
  const [allLevels, setAllLevels] = useState(false);
  const areaId = useId();
  const storageKey =
    preferenceKey ?? (compact ? "cryptobot:trade-chart-view" : "cryptobot:chart-view");
  const W = compact ? 400 : 760,
    plot = compact ? 330 : 640;
  const [technical, setTechnical] = useState(false);
  const [showEma, setShowEma] = useState(true);
  const [showBands, setShowBands] = useState(true);
  const [tool, setTool] = useState("inspect");
  const [drawingPrice, setDrawingPrice] = useState("");
  const [marks, setMarks] = useState<{ price: number; label: string }[]>([]);
  const [measure, setMeasure] = useState<{ time: number; price: number }[]>([]);
  const studies = useMemo(() => technicalSeries(candles, minutes, now), [candles, minutes, now]);
  const indicators = useMemo(() => chartIndicators(candles, minutes, now), [candles, minutes, now]);
  const [hours, setHours] = useState(24);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ChartTrade | null>(null);
  const numberedTrades = useMemo(() => {
    let buys = 0,
      sells = 0;
    return [...trades]
      .filter((t) => Number.isFinite(t.time))
      .sort((a, b) => a.time - b.time || (a.id ?? a.hash ?? "").localeCompare(b.id ?? b.hash ?? ""))
      .map((t) => ({
        ...t,
        id: t.id ?? t.hash ?? `${t.side}:${t.time}`,
        label: t.side === "compra" ? `C${++buys}` : `V${++sells}`,
      }));
  }, [trades]);
  const fitted = numberedTrades.filter((t) => fitTradeIds.includes(t.id));
  const firstFit = fitted.length ? Math.min(...fitted.map((t) => t.time)) : null;
  const lastFit = fitted.length ? Math.max(...fitted.map((t) => t.time)) : null;
  const lastFocus = useRef<string>("");

  const [fitEntries, setFitEntries] = useState(true);
  const [follow, setFollow] = useState(true);
  const [view, setView] = useState<View | null>(null);
  const [probe, setProbe] = useState<{ t: number; px: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stateRef = useRef({ view, follow, hours, now, minutes });
  stateRef.current = { view, follow, hours, now, minutes };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const pinch = useRef<{ dist: number; span: number; anchorT: number } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (!alignStrategy && [5, 15, 30, 60].includes(saved?.minutes)) setMinutes(saved.minutes);
      if ([1, 4, 12, 24].includes(saved?.hours)) setHours(saved.hours);
      if ([260, 320, 420, 560].includes(saved?.height)) setHeight(saved.height);
      if (["candles", "line"].includes(saved?.mode)) setMode(saved.mode);
      if (typeof saved?.allLevels === "boolean") setAllLevels(saved.allLevels);
      if (typeof saved?.showSma === "boolean") setShowSma(saved.showSma);
      if (typeof saved?.technical === "boolean") setTechnical(saved.technical);
      if (typeof saved?.showEma === "boolean") setShowEma(saved.showEma);
      if (typeof saved?.showBands === "boolean") setShowBands(saved.showBands);
    } catch {
      /* default */
    }
    if (alignStrategy) setMinutes(strategyMinutes);
    setReady(true);
  }, [alignStrategy, strategyMinutes, storageKey]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            minutes,
            hours,
            height,
            mode,
            showSma,
            technical,
            showEma,
            showBands,
            allLevels,
          }),
        );
      } catch {
        /* unavailable */
      }
  }, [
    minutes,
    hours,
    ready,
    height,
    mode,
    showSma,
    technical,
    showEma,
    showBands,
    allLevels,
    storageKey,
  ]);

  // Enquadramento previsível: seguir o presente dentro da janela escolhida.
  const frame = useCallback(
    (h: number) => ({ start: stateRef.current.now - h * 3_600_000, end: stateRef.current.now }),
    [],
  );
  useEffect(() => {
    if (follow) {
      const normal = frame(hours);
      // Preserve all entries of the held position when following the market.

      const padding = Math.max(minutes * 60000, MIN_SPAN / 4);
      setView(
        fitEntries && firstFit != null && lastFit != null
          ? {
              start: Math.min(normal.start, firstFit - padding),
              end: Math.max(normal.end, lastFit + padding),
            }
          : normal,
      );
    }
  }, [follow, hours, now, frame, minutes, firstFit, lastFit, fitEntries]);

  const v: View = view ?? frame(hours);
  const span = v.end - v.start;
  const clampView = (next: View): View => {
    const s = Math.min(MAX_SPAN, Math.max(MIN_SPAN, next.end - next.start));
    const mid = (next.start + next.end) / 2;
    return { start: mid - s / 2, end: mid + s / 2 };
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
      const anchorT =
        cur.start + ((e.clientX - rect.left) / ((rect.width * plot) / W)) * (cur.end - cur.start);
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      zoomAt(anchorT, Math.exp(dy * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [frame, candles.length, W, plot]);

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
  const visibleTrades = numberedTrades.filter((t) => t.time >= v.start && t.time <= v.end);

  // Escala vertical recalculada a partir do trecho visível — picos nunca são cortados.
  const quote =
    liveQuote &&
    Number.isFinite(liveQuote.price) &&
    liveQuote.price > 0 &&
    now - liveQuote.at <= 15000 &&
    liveQuote.at <= now + 5000
      ? liveQuote
      : null;
  const points = [
    ...(quote ? [quote.price] : []),
    ...visibleBars.flatMap((b) => [b.candle[2], b.candle[3]]),
    // In the simple view, asynchronous targets must not flatten market candles.
    ...(!compact || allLevels ? levels.filter((l) => l.price > 0).map((l) => l.price) : []),
    ...visibleTrades.flatMap((t) => (t.price != null && t.price > 0 ? [t.price] : [])),
    ...marks.map((m) => m.price),
    ...measure.map((m) => m.price),
    ...(technical
      ? studies
          .filter((s) => s.time >= v.start && s.time <= v.end)
          .flatMap((s) =>
            [showEma ? s.ema : null, showBands ? s.upper : null, showBands ? s.lower : null].filter(
              (n): n is number => n != null,
            ),
          )
      : []),
    ...(showSma
      ? visibleSeries.flatMap((s) => [s.fast, s.slow].filter((x): x is number => x != null))
      : []),
  ];
  const low = points.length ? Math.min(...points) : 0,
    high = points.length ? Math.max(...points) : 1;
  const pad = (high - low || high || 1) * 0.08;
  const min = Math.max(0, low - pad),
    max = high + pad;

  const H = height;
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
    return v.start + ((clientX - rect.left) / ((rect.width * plot) / W)) * span;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && ![0, 1, 2].includes(e.button)) return;
    if (e.pointerType === "mouse" && e.button !== 0) e.preventDefault();
    if (pointers.current.size === 0) {
      gestureStart.current = { x: e.clientX, y: e.clientY };
      suppressClick.current = false;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      suppressClick.current = true;
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
    } else if (e.pointerType === "touch" && tool === "inspect") {
      const t = tFromEvent(e.clientX);
      longPress.current = setTimeout(() => {
        if (t != null) setProbe({ t, px: e.clientX });
      }, 500);
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    const start = gestureStart.current;
    if (prev && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
      suppressClick.current = true;
      if (longPress.current) {
        clearTimeout(longPress.current);
        longPress.current = null;
      }
    }
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
      if (suppressClick.current && Math.abs(dx) > Math.abs(e.clientY - prev.y))
        panBy((-dx / (svgRef.current?.getBoundingClientRect().width || 1)) * span);
      return;
    }
    if (
      prev &&
      pointers.current.size === 1 &&
      e.pointerType === "mouse" &&
      (e.buttons & 7) !== 0 &&
      suppressClick.current
    ) {
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

  useEffect(() => {
    if (!focusRequest) return;
    const target = numberedTrades.find((t) => t.id === focusRequest.id);
    const key = `${focusRequest.id}:${focusRequest.request}`;
    if (!target || lastFocus.current === key) return;
    lastFocus.current = key;
    setSelected(target);
    const half = Math.max(MIN_SPAN, minutes * 60000 * 12) / 2;
    setView({ start: target.time - half, end: target.time + half });
    setFollow(false);
  }, [focusRequest, numberedTrades, minutes]);

  const fmtTime = (t: number) =>
    new Date(t).toLocaleString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      timeZoneName: "short",
    });

  return (
    <div
      className={cn(
        "min-w-0 space-y-3",
        minimal && "[&>div]:hidden [&>p]:hidden [&>details]:hidden",
      )}
    >
      {(!compact || controls) && (
        <>
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
                  setFitEntries(false);
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
              <input
                type="checkbox"
                checked={showSma}
                onChange={(e) => setShowSma(e.target.checked)}
              />{" "}
              Médias do robô
            </label>
            <Button
              size="sm"
              variant={technical ? "secondary" : "outline"}
              aria-pressed={technical}
              onClick={() => setTechnical(!technical)}
            >
              {technical ? "Modo avançado · indicadores" : "Indicadores técnicos · modo avançado"}
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
                Intervalo {minutes}m · apenas velas fechadas e completas desde a última lacuna.
                RSI/ATR exigem 15 velas; EMA exige 20. RSI: força relativa; EMA: tendência; ATR:
                amplitude de oscilação. Indicadores visuais não alteram o robô e não são sinais
                automáticos de compra ou venda.
              </p>
            </section>
          )}
          <details className="rounded-md border border-border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Ferramentas de marcação e medição
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label>
                Ferramenta{" "}
                <select
                  aria-label="Ferramenta do gráfico"
                  value={tool}
                  onChange={(e) => {
                    setTool(e.target.value);
                    setMeasure([]);
                  }}
                  className="rounded border border-border bg-background p-2"
                >
                  <option value="inspect">Inspecionar / arrastar</option>
                  <option value="measure">Medir dois pontos</option>
                  <option value="support">Suporte · tocar no gráfico</option>
                  <option value="resistance">Resistência · tocar no gráfico</option>
                  <option value="horizontal">Linha horizontal · tocar no gráfico</option>
                </select>
              </label>
              <label>
                Preço USD{" "}
                <input
                  aria-label="Preço da marcação"
                  type="number"
                  min="0"
                  step="any"
                  value={drawingPrice}
                  onChange={(e) => setDrawingPrice(e.target.value)}
                  className="w-32 rounded border border-border bg-background p-2"
                />
              </label>
              {["Linha horizontal", "Suporte", "Resistência"].map((label) => (
                <Button
                  key={label}
                  size="sm"
                  variant="outline"
                  disabled={!(Number(drawingPrice) > 0 && Number.isFinite(Number(drawingPrice)))}
                  onClick={() =>
                    setMarks((m) => [...m.slice(-9), { price: Number(drawingPrice), label }])
                  }
                >
                  {label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMarks([]);
                  setMeasure([]);
                }}
              >
                Limpar marcações
              </Button>
            </div>
            <p className="mt-2 text-muted-foreground">
              Marcações temporárias em USD; não enviam ordens. Na medição, toque ou clique em dois
              pontos da área de preços. Para desenhar suporte, resistência ou linha, selecione a
              ferramenta e toque no gráfico.
            </p>
            {marks.map((m, i) => (
              <p key={i}>
                {m.label}: US$ {usd(m.price)}{" "}
                <button
                  aria-label={`Excluir marcação ${i + 1}`}
                  onClick={() => setMarks((a) => a.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </p>
            ))}
            {measure.length === 1 && (
              <p role="status">Primeiro ponto selecionado. Toque no segundo ponto do gráfico.</p>
            )}
            {measure.length === 2 && (
              <p role="status">
                Variação: {((measure[1]!.price / measure[0]!.price - 1) * 100).toFixed(2)}% ·
                Intervalo: {Math.abs(measure[1]!.time - measure[0]!.time) / 60000} min
              </p>
            )}
          </details>
          <p className="text-xs font-semibold">
            Gráfico: {minutes === 60 ? "1h" : `${minutes}m`} | Estratégia:{" "}
            {strategyMinutes === 60 ? "1h" : `${strategyMinutes}m`}
          </p>
          {atHistoryLimit && (
            <p className="text-xs text-warning">Limite do histórico disponível.</p>
          )}
          {tool !== "inspect" && (
            <div
              role="status"
              className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm"
            >
              {tool === "measure"
                ? measure.length === 0
                  ? "Medição ativa: toque ou clique no primeiro ponto do gráfico."
                  : measure.length === 1
                    ? "Ponto 1 marcado. Toque ou clique no segundo ponto."
                    : `Medição concluída: ${((measure[1]!.price / measure[0]!.price - 1) * 100).toFixed(2)}% · ${Math.abs(measure[1]!.time - measure[0]!.time) / 60000 < 1 ? "menos de 1" : Math.round(Math.abs(measure[1]!.time - measure[0]!.time) / 60000)} min. Toque para iniciar outra medição.`
                : "Desenho ativo: toque ou clique na altura do preço desejado."}
              <p className="mt-1 text-xs font-normal">
                Clique sem arrastar para marcar. Para mover, arraste com o botão esquerdo, direito
                ou central do mouse. No celular, deslize para mover e toque para marcar.
              </p>
            </div>
          )}
        </>
      )}
      {compact && levels.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium">
            {allLevels ? "Todos os níveis" : "Foco no preço e nas operações"}
          </span>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={allLevels}
            onClick={() => setAllLevels(!allLevels)}
          >
            {allLevels ? "Focar nas operações" : "Ver todos os níveis"}
          </Button>
        </div>
      )}
      {compact && (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Controles rápidos do gráfico"
        >
          <div
            className="flex rounded-full bg-secondary p-1"
            role="group"
            aria-label="Tipo de gráfico"
          >
            <Button
              size="sm"
              variant={mode === "candles" ? "default" : "ghost"}
              className="rounded-full"
              aria-pressed={mode === "candles"}
              onClick={() => setMode("candles")}
            >
              Velas
            </Button>
            <Button
              size="sm"
              variant={mode === "line" ? "default" : "ghost"}
              className="rounded-full"
              aria-pressed={mode === "line"}
              onClick={() => setMode("line")}
            >
              Linha
            </Button>
          </div>
          {windows.map((w) => (
            <Button
              key={w.hours}
              size="sm"
              className="rounded-full"
              variant={hours === w.hours ? "secondary" : "ghost"}
              aria-pressed={hours === w.hours}
              onClick={() => {
                setFitEntries(false);
                setHours(w.hours);
                setFollow(true);
              }}
            >
              {w.id}
            </Button>
          ))}
          {mode === "candles" && (
            <select
              aria-label="Intervalo das velas"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="rounded-full border border-border bg-background px-3 py-2"
            >
              {[5, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m === 60 ? "1h" : `${m}m`}
                </option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={controls}
            onClick={() => {
              setControls(!controls);
              if (controls) setTool("inspect");
            }}
          >
            {controls ? "Ocultar ferramentas" : "Ferramentas"}
          </Button>
        </div>
      )}
      {bars.length || visibleTrades.length ? (
        <svg
          ref={svgRef}
          role="img"
          aria-label="Velas OHLCV, escala de preços e médias SMA do robô"
          viewBox={`0 0 ${W} ${volBase + 20}`}
          className={cn(
            "w-full touch-pan-y select-none overflow-hidden",
            minimal && "max-h-[calc(100dvh-14rem)] min-h-56",
            tool !== "inspect" && "cursor-crosshair",
          )}
          onPointerDown={onPointerDown}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => {
            if (tool === "inspect" || e.button !== 0 || suppressClick.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) * W) / rect.width;
            const py = ((e.clientY - rect.top) * (volBase + 20)) / rect.height;
            if (
              !Number.isFinite(px) ||
              !Number.isFinite(py) ||
              px < 0 ||
              px > plot ||
              py < 12 ||
              py > H - 12
            )
              return;
            const point = {
              time: v.start + (px / plot) * span,
              price: max - ((py - 12) / (H - 24)) * (max - min),
            };
            if (tool === "measure") setMeasure((a) => (a.length === 1 ? [a[0]!, point] : [point]));
            else
              setMarks((a) => [
                ...a.slice(-9),
                {
                  price: point.price,
                  label:
                    tool === "support"
                      ? "Suporte"
                      : tool === "resistance"
                        ? "Resistência"
                        : "Linha horizontal",
                },
              ]);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => {
            suppressClick.current = true;
            onPointerUp(e);
          }}
          onPointerLeave={() => {
            if (pointers.current.size === 0) setProbe(null);
          }}
        >
          {(points.length ? [0, 1, 2, 3, 4] : []).map((i) => {
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
          {quote && (
            <g
              className="text-warning"
              aria-label={`Cotação atual independente das velas: US$ ${usd(quote.price)}`}
            >
              <line
                x1={0}
                x2={plot}
                y1={y(quote.price)}
                y2={y(quote.price)}
                stroke="currentColor"
                strokeDasharray="3 3"
              />
              <circle
                cx={Math.max(0, Math.min(plot, x(quote.at)))}
                cy={y(quote.price)}
                r={4}
                fill="currentColor"
              />
              <text x={8} y={y(quote.price) - 5} fill="currentColor" fontSize={11}>
                Agora · US$ {usd(quote.price)}
              </text>
            </g>
          )}
          {marks
            .filter((m) => m.price >= min && m.price <= max)
            .map((m, i) => (
              <g key={`mark-${i}`} className="text-chart-4">
                <line
                  x1={0}
                  x2={plot}
                  y1={y(m.price)}
                  y2={y(m.price)}
                  stroke="currentColor"
                  strokeDasharray="6 4"
                />
                <text x={8} y={y(m.price) - 5} fill="currentColor" fontSize={11}>
                  {m.label} · {usd(m.price)}
                </text>
              </g>
            ))}
          {technical &&
            (["ema", "upper", "lower"] as const)
              .filter((key) => (key === "ema" ? showEma : showBands))
              .map((key) => {
                let prev = 0;
                const d = studies
                  .filter((s) => s.time >= v.start && s.time <= v.end)
                  .map((s) => {
                    const value = s[key];
                    if (value == null) {
                      prev = 0;
                      return "";
                    }
                    const cmd = !prev || s.time - prev > minutes * 60000 ? "M" : "L";
                    prev = s.time;
                    return `${cmd}${x(s.time)},${y(value)}`;
                  })
                  .join(" ");
                return (
                  <path
                    key={key}
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray={key === "ema" ? undefined : "4 3"}
                    className={key === "ema" ? "text-chart-4" : "text-muted-foreground"}
                  />
                );
              })}
          {levels
            .filter((l) => l.price >= min && l.price <= max)
            .map((l, i) => (
              <line
                key={i}
                aria-label={`${l.label}: US$ ${usd(l.price)}`}
                x1={0}
                x2={plot}
                y1={y(l.price)}
                y2={y(l.price)}
                stroke="currentColor"
                strokeDasharray="5 4"
                className={tones[l.tone]}
              />
            ))}
          {mode === "line" &&
            (() => {
              const segments: (typeof visibleBars)[] = [];
              for (const bar of visibleBars) {
                const tail = segments.at(-1);
                if (!tail || bar.candle[0] !== (tail.at(-1)?.candle[0] ?? 0) + minutes * 60)
                  segments.push([bar]);
                else tail.push(bar);
              }
              const tone =
                (visibleBars.at(-1)?.candle[4] ?? 0) >= (visibleBars[0]?.candle[4] ?? 0)
                  ? "text-success"
                  : "text-destructive";
              return (
                <g className={compact ? tone : "text-primary"} aria-label="Gráfico de linha e área">
                  <defs>
                    <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {segments.map((segment, i) => {
                    const first = segment[0]!,
                      last = segment.at(-1)!;
                    const d = segment
                      .map(
                        (b, j) =>
                          `${j === 0 ? "M" : "L"}${x(b.candle[0] * 1000)},${y(b.candle[4])}`,
                      )
                      .join(" ");
                    return (
                      <g key={i}>
                        <path
                          d={`${d} L${x(last.candle[0] * 1000)},${y(min)} L${x(first.candle[0] * 1000)},${y(min)} Z`}
                          fill={`url(#${areaId})`}
                          stroke="none"
                        />
                        <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} />
                      </g>
                    );
                  })}
                  {visibleBars.at(-1) && (
                    <circle
                      cx={x(visibleBars.at(-1)!.candle[0] * 1000)}
                      cy={y(visibleBars.at(-1)!.candle[4])}
                      r={4}
                      fill="currentColor"
                    />
                  )}
                </g>
              );
            })()}
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
            const nearby = bars.find(
              (b) => b.candle[0] * 1000 <= t.time && (b.candle[0] + minutes * 60) * 1000 > t.time,
            );
            const price = t.price ?? nearby?.candle[4];
            const overlap = visibleTrades
              .slice(0, i)
              .filter(
                (other) =>
                  Math.floor(other.time / (minutes * 60000)) ===
                  Math.floor(t.time / (minutes * 60000)),
              ).length;
            const anchorY = price == null ? H + 8 : y(price);
            const markerY =
              price == null
                ? H + 8 + (overlap % 2) * 20
                : Math.max(16, Math.min(H - 24, anchorY - overlap * 26));
            const active = (selected?.id ?? selected?.hash) === t.id;
            return (
              <g
                key={t.id}
                role="button"
                tabIndex={0}
                aria-label={`${t.label} · ${t.side} · ${fmtTime(t.time)}${price == null ? " · cotação histórica indisponível" : ""}`}
                aria-pressed={active}
                data-trade-id={t.id}
                className={cn(
                  "cursor-pointer",
                  t.side === "compra" ? "text-success" : "text-destructive",
                )}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  focusTrade(t);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    focusTrade(t);
                  }
                }}
              >
                <title>
                  {t.label} · {t.side} · {t.hash} ·{" "}
                  {price == null
                    ? "Horário da operação; sem cotação histórica. Sem posicionamento de preço."
                    : t.price == null
                      ? "Posição vertical aproximada pelo histórico"
                      : "Preço registrado"}
                </title>
                {price != null && markerY !== anchorY && (
                  <line
                    x1={x(t.time)}
                    x2={x(t.time)}
                    y1={anchorY}
                    y2={markerY}
                    stroke="currentColor"
                    strokeDasharray="2 2"
                  />
                )}
                {active && (
                  <line
                    x1={x(t.time)}
                    x2={x(t.time)}
                    y1={8}
                    y2={H}
                    stroke="currentColor"
                    strokeDasharray="3 3"
                    opacity={0.6}
                  />
                )}
                <circle
                  cx={x(t.time)}
                  cy={markerY}
                  r={5}
                  fill={price == null ? "var(--background)" : "currentColor"}
                  stroke="currentColor"
                  strokeWidth={active ? 3 : 1}
                />
                <circle cx={x(t.time)} cy={markerY} r={12} fill="transparent" />
                <text
                  x={Math.min(plot - 18, Math.max(4, x(t.time)))}
                  y={markerY + 17}
                  fill="currentColor"
                  fontSize={11}
                  fontWeight={active ? 700 : 500}
                >
                  {t.label}
                  {price == null ? " ?" : ""}
                </text>
              </g>
            );
          })}
          {measure.map((m, i) => (
            <g key={`measure-${i}`} className="text-primary">
              <circle cx={x(m.time)} cy={y(m.price)} r={5} fill="currentColor" />
              <text x={x(m.time) + 8} y={y(m.price) - 8} fill="currentColor" fontSize={12}>
                {i + 1}
              </text>
            </g>
          ))}
          {measure.length === 2 && (
            <line
              x1={x(measure[0]!.time)}
              x2={x(measure[1]!.time)}
              y1={y(measure[0]!.price)}
              y2={y(measure[1]!.price)}
              stroke="currentColor"
              strokeDasharray="4 4"
              className="text-primary"
            />
          )}
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
      {technical && (
        <div className="rounded-md border border-border p-2">
          <div className="flex flex-wrap gap-4 text-xs">
            <label>
              <input
                type="checkbox"
                checked={showEma}
                onChange={(e) => setShowEma(e.target.checked)}
              />{" "}
              EMA 20
            </label>
            <label>
              <input
                type="checkbox"
                checked={showBands}
                onChange={(e) => setShowBands(e.target.checked)}
              />{" "}
              Bollinger 20 · 2 desvios
            </label>
          </div>
          <svg
            role="img"
            aria-label="RSI 14, níveis 30 e 70"
            viewBox={`0 0 ${W} 120`}
            className="w-full"
          >
            {[30, 70].map((n) => (
              <g key={n} className="text-muted-foreground">
                <line
                  x1={0}
                  x2={plot}
                  y1={100 - n * 0.8}
                  y2={100 - n * 0.8}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                />
                <text x={plot + 8} y={104 - n * 0.8} fill="currentColor" fontSize={12}>
                  {n}
                </text>
              </g>
            ))}
            <path
              d={(() => {
                let prev = 0;
                return studies
                  .filter((s) => s.time >= v.start && s.time <= v.end)
                  .map((s) => {
                    if (s.rsi == null) {
                      prev = 0;
                      return "";
                    }
                    const cmd = !prev || s.time - prev > minutes * 60000 ? "M" : "L";
                    prev = s.time;
                    return `${cmd}${x(s.time)},${100 - s.rsi * 0.8}`;
                  })
                  .join(" ");
              })()}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-primary"
            />
            <text x={8} y={14} fill="currentColor" fontSize={12}>
              RSI 14 · {minutes}m
            </text>
          </svg>
        </div>
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
        {showSma && (
          <>
            <span className="text-primary">SMA {fastLength}</span> ·{" "}
            <span className="text-chart-4">SMA {slowLength}</span> ·{" "}
          </>
        )}
        USD · OHLCV do pool / GeckoTerminal ·{" "}
        {bars.some((b) => b.forming) ? "Última vela em formação" : "Sem vela atual"} ·{" "}
        {volumeMax ? "Volume em USD" : "Volume indisponível"}
      </p>
      {technical && (
        <p className="text-[11px] text-warning">
          Médias da regra real: fechamentos agrupados em {strategyMinutes}m; a regra antiga pode
          aceitar grupos incompletos. A candidata exige sequência completa e não comprime lacunas.
        </p>
      )}
      {levels.length > 0 && (
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {levels
            .filter((l) => l.label)
            .map((l, i) => (
              <li key={i} className={tones[l.tone]}>
                {l.label}: US$ {usd(l.price)}
                {l.price > max
                  ? " · ↑ acima da área visível"
                  : l.price < min
                    ? " · ↓ abaixo da área visível"
                    : ""}
                <FiatValue usd={l.price} hideUsdDuplicate />
              </li>
            ))}
        </ul>
      )}
      {fitted.length > 0 && !minimal && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setFitEntries(true);
            setFollow(true);
          }}
        >
          Mostrar todas as entradas da posição
        </Button>
      )}
      {numberedTrades.length > 0 && (
        <div className="space-y-2" aria-label="Todas as operações registradas">
          <p className="text-xs text-muted-foreground">
            {visibleTrades.length} de {numberedTrades.length} operações neste período. Toque para
            localizar; “?” indica ausência de cotação histórica.
          </p>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {numberedTrades.map((t) => (
              <Button
                key={t.id}
                aria-pressed={selected?.id === t.id}
                size="sm"
                variant="outline"
                onClick={() => focusTrade(t)}
                className={cn(t.side === "compra" ? "text-success" : "text-destructive")}
              >
                {t.label} ·{" "}
                {new Date(t.time).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {t.time < v.start || t.time > v.end ? " · fora do período" : ""}
              </Button>
            ))}
          </div>
        </div>
      )}
      {selected && (
        <div
          role="status"
          aria-label="Detalhes da operação selecionada"
          className="border-t border-border pt-3 text-sm"
        >
          <p className="font-semibold">
            {numberedTrades.find((t) => t.id === selected.id)?.label} · {selected.side} ·{" "}
            {new Date(selected.time).toLocaleString("pt-BR")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.price != null
              ? `Preço registrado: US$ ${usd(selected.price)}`
              : bars.some(
                    (b) =>
                      b.candle[0] * 1000 <= selected.time &&
                      (b.candle[0] + minutes * 60) * 1000 > selected.time,
                  )
                ? "Ponto de referência da vela; não é o preço efetivo da execução."
                : "Sem vela histórica para este horário. A marca indica a data da operação, sem estimar o preço."}
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
  alignStrategy?: boolean;
  compact?: boolean;
  preferenceKey?: string;
  minimal?: boolean;
  position?: { symbol: string; quantity: number; costBnb: number; averageUsd: number };
  liveQuote?: { price: number; at: number } | undefined;
  rulesVersion?: 1 | 2;
  fastLength?: number;
  slowLength?: number;
  levels?: ChartLevel[];
  trades?: ChartTrade[];
  focusRequest?: { id: string; request: number } | null;
  fitTradeIds?: string[];
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
    <div
      ref={overlayRef}
      data-robot-chart
      className={
        expanded ? "fixed inset-0 z-50 overflow-auto bg-background p-3 sm:p-6" : "min-w-0 space-y-2"
      }
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? "Gráfico ampliado" : undefined}
    >
      <div className={cn("mb-2 flex justify-end", props.minimal && !expanded && "hidden")}>
        <Button size="sm" variant="outline" onClick={expanded ? closeExpanded : openExpanded}>
          {expanded ? <X className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
          {expanded ? "Fechar" : "Ampliar gráfico"}
        </Button>
      </div>
      {(expanded || props.minimal) && props.position && (
        <dl
          aria-label="Dados da posição mantida"
          className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"
        >
          <div>
            <dt>Compra · {props.position.symbol}</dt>
            <dd>
              {props.position.quantity.toLocaleString("pt-BR", { maximumSignificantDigits: 8 })}
            </dd>
          </div>
          <div>
            <dt>Preço médio</dt>
            <dd>US$ {usd(props.position.averageUsd)}</dd>
            <FiatValue usd={props.position.averageUsd} hideUsdDuplicate />
          </div>
          <div>
            <dt>Custo registrado</dt>
            <dd>
              {props.position.costBnb.toLocaleString("pt-BR", { maximumSignificantDigits: 8 })} BNB
            </dd>
            <FiatValue bnb={props.position.costBnb} />
          </div>
        </dl>
      )}
      <ChartBody {...props} minimal={expanded || !!props.minimal} />
    </div>
  );
}
