import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import Decimal from "decimal.js";
import { useCurrency } from "@/hooks/currencyContext";
import { useChartPool } from "@/hooks/useChartPool";
import { useCandles } from "@/hooks/useCandles";
import { getTradingMarket } from "@/lib/chain.functions";
import { getWalletCapital } from "@/lib/capital.functions";
import { getChartGasReference, saveChartPlan } from "@/lib/chartRule.functions";
import { getGuidedBotSettings, getBotReadiness, startGuidedBot } from "@/lib/guidedBot.functions";
import { createBotWallet } from "@/lib/bot.functions";
import { getTokenTax } from "@/lib/userTokens.functions";
import { getFxQuote } from "@/lib/fx.functions";
import { taxFor, hasVerifiedTax } from "@/lib/tokens";
import {
  dividePlanBudget,
  suggestPlanExits,
  planProjection,
  planEntryResults,
  planPartialScenarios,
  splitExitShares,
  chartPlanInputSchema,
} from "@/lib/chartPlan";
import { formatFiat } from "@/lib/fiat";
import { formatPrice, formatDistancePct } from "@/lib/display";
import { userMessage, formIssueMessage } from "@/lib/userMessage";
import type { StrategyConfig } from "@/lib/strategy";
import { CandleChart, type ChartLevel } from "./CandleChart";
import { FundBotDialog } from "./FundBotDialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Props = {
  token: string;
  symbol: string;
  walletScope: string;
  walletName: string;
  userId: string;
  sourceAddress: string | null;
  onSaved?: (() => void | Promise<void>) | undefined;
  onClose: () => void;
};
type Costs = {
  buyTaxPct: number;
  sellTaxPct: number;
  gasBuyBnb: number;
  gasSellBnb: number;
  executionMarginPct: number;
  at: number;
};
type Currency = "BRL" | "USD" | "EUR" | "BNB";
const numeric = (s: string) => (s.trim() ? Number(s) : NaN);
const exact = (n: number) =>
  Number.isFinite(n) ? new Decimal(n).toSignificantDigits(12).toFixed() : "";

export function ChartPlanWizard({
  token,
  symbol,
  walletScope,
  walletName,
  userId,
  sourceAddress,
  onSaved,
  onClose,
}: Props) {
  const display = useCurrency();
  const [currency, setCurrency] = useState<Currency>(display.currency);
  const [step, setStep] = useState(0),
    [now, setNow] = useState(Date.now);
  const [budget, setBudget] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState(1),
    [exitCount, setExitCount] = useState(1);
  const [entries, setEntries] = useState<number[]>([0]);
  const [manualExits, setManualExits] = useState<number[] | null>(null);
  const [pick, setPick] = useState<{ kind: "entry" | "exit" | "stop"; index: number } | null>({
    kind: "entry",
    index: 0,
  });
  const [target, setTarget] = useState("3");
  const [partialAck, setPartialAck] = useState(false);
  const [stopChoice, setStopChoice] = useState<"price" | "none" | "">("");
  const [stop, setStop] = useState(0);
  const [snapshot, setSnapshot] = useState<Costs | null>(null);
  const [manualBuy, setManualBuy] = useState(""),
    [manualSell, setManualSell] = useState("");
  const [manualTaxConfirmed, setManualTaxConfirmed] = useState(false);
  const [gasBuyOverride, setGasBuyOverride] = useState(""),
    [gasSellOverride, setGasSellOverride] = useState("");
  const [margin, setMargin] = useState("1"),
    [maxGas, setMaxGas] = useState("5"),
    [minLiquidity, setMinLiquidity] = useState("5000");
  const [ack, setAck] = useState(false),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [startAck, setStartAck] = useState(false),
    [started, setStarted] = useState(false);
  const initialized = useRef(false),
    mounted = useRef(true);
  const draftKey = `cryptobot:chart-plan:v2:${userId}:${walletScope}:${token.toLowerCase()}`;
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  const settings = useQuery({
    queryKey: ["chart-plan-settings", userId, walletScope, token],
    queryFn: () => getGuidedBotSettings({ data: { walletScope, token } }),
    retry: false,
  });
  const capital = useQuery({
    queryKey: ["chart-plan-capital", userId, walletScope],
    queryFn: () => getWalletCapital({ data: { walletScope } }),
    refetchInterval: 10000,
    retry: false,
  });
  const gas = useQuery({
    queryKey: ["chart-rule-gas", userId, walletScope, token],
    queryFn: () => getChartGasReference({ data: { walletScope, token } }),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });
  const market = useQuery({
    queryKey: ["trading-market", token],
    queryFn: () => getTradingMarket({ data: { address: token } }),
    staleTime: 2000,
    refetchInterval: 3000,
    retry: false,
  });
  const fx = useQuery({
    queryKey: ["display-fx"],
    queryFn: () => getFxQuote(),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
  });
  const cfg = settings.data?.strategy?.config as Partial<StrategyConfig> | undefined;
  const state = settings.data?.bot?.strat_state as
    { tokens?: number; costBnb?: number } | null | undefined;
  const locked =
    !!settings.data?.bot?.armed ||
    Number(state?.tokens ?? 0) > 0 ||
    Number(state?.costBnb ?? 0) > 0;
  const knownTax = hasVerifiedTax(token, cfg);
  const tax = useQuery({
    queryKey: ["chart-plan-tax", userId, walletScope, token],
    queryFn: () => getTokenTax({ data: { address: token } }),
    enabled: settings.isSuccess && !knownTax,
    staleTime: 60000,
    retry: false,
  });
  const referenceTax = knownTax ? taxFor(token, cfg) : tax.data?.tax;
  const manualTaxes = manualBuy.trim() !== "" || manualSell.trim() !== "";
  const buyTax = manualTaxes ? numeric(manualBuy) : referenceTax?.buy;
  const sellTax = manualTaxes ? numeric(manualSell) : referenceTax?.sell;
  const taxReady =
    buyTax != null &&
    sellTax != null &&
    Number.isFinite(buyTax) &&
    Number.isFinite(sellTax) &&
    buyTax >= 0 &&
    sellTax >= 0 &&
    buyTax < 100 &&
    sellTax < 100 &&
    (!manualTaxes || manualTaxConfirmed);
  const liveCosts: Costs | null =
    taxReady && gas.data
      ? {
          buyTaxPct: buyTax!,
          sellTaxPct: sellTax!,
          gasBuyBnb: gasBuyOverride ? numeric(gasBuyOverride) : Number(gas.data.gasBuyBnb),
          gasSellBnb: gasSellOverride ? numeric(gasSellOverride) : Number(gas.data.gasSellBnb),
          executionMarginPct: numeric(margin),
          at: Date.parse(gas.data.at),
        }
      : null;
  const costs = snapshot ?? liveCosts;
  const costsValid =
    costs != null &&
    Object.values(costs).every(Number.isFinite) &&
    costs.gasBuyBnb >= 0 &&
    costs.gasSellBnb >= 0 &&
    costs.executionMarginPct >= 0 &&
    costs.executionMarginPct <= 20;
  const pool = market.data?.pools.find((p) => p.supported);
  const chartPool = useChartPool(token, pool),
    candles = useCandles(chartPool, token);
  const native = Number(pool?.priceNative),
    usd = Number(pool?.priceUsd),
    quoteAt = Date.parse(market.data?.fetchedAt ?? "");
  const bnbUsd = native > 0 && usd > 0 ? usd / native : null;
  const fresh =
    bnbUsd != null &&
    Number.isFinite(bnbUsd) &&
    !market.isError &&
    !market.data?.error &&
    now - quoteAt <= 15000 &&
    quoteAt <= now + 5000;
  const rates =
    display.quote && now - display.quote.at < 180000
      ? display.quote
      : fx.data && !fx.isError && now - fx.data.at < 180000
        ? fx.data
        : null;
  const rate =
    currency === "BNB"
      ? 1
      : bnbUsd == null
        ? null
        : currency === "USD"
          ? bnbUsd
          : currency === "BRL" && rates?.usdBrl
            ? bnbUsd * rates.usdBrl
            : currency === "EUR" && rates?.usdEur
              ? bnbUsd * rates.usdEur
              : null;
  const money = (n: number | string) =>
    rate == null || !Number.isFinite(Number(n))
      ? "Conversão indisponível"
      : currency === "BNB"
        ? `${formatPrice(n)} BNB`
        : Number(n) !== 0 && Math.abs(Number(n) * rate) < 0.01
          ? `${currency === "BRL" ? "R$" : currency === "EUR" ? "€" : "US$"} ${formatPrice(Number(n) * rate)}`
          : formatFiat(Number(n) * rate, currency);
  const priceText = (n: number) =>
    n > 0 ? `${money(n)} por ${symbol}` : "Toque no gráfico para marcar";
  const capitalFresh =
    !!capital.data && !capital.isError && now - Date.parse(capital.data.at) < 30000;
  const available = capitalFresh ? capital.data!.free : null;
  const chosen = budget ?? available ?? "";
  const allocation = costsValid
    ? dividePlanBudget(chosen, entryCount, exitCount, costs!.gasBuyBnb, costs!.gasSellBnb)
    : null;
  const sortedEntries = [...entries].sort((a, b) => b - a);
  const automatic =
    allocation && costsValid && entries.every((p) => p > 0)
      ? suggestPlanExits(
          { ...costs!, entryPrices: sortedEntries, amounts: allocation.amounts },
          exitCount,
          numeric(target),
        )
      : [];
  const exits = manualExits ?? automatic;
  const shares = splitExitShares(exitCount);
  const model =
    allocation && costsValid && entries.every((p) => p > 0) && exits.length === exitCount
      ? {
          ...costs!,
          entryPrices: sortedEntries,
          exitPrices: [...exits].sort((a, b) => a - b),
          amounts: allocation.amounts,
        }
      : null;
  const projection = model ? planProjection(model) : null;
  const adverse = model ? planProjection(model, "slippage") : null;
  const entryResults = model ? planEntryResults(model) : [];
  const partials = model ? planPartialScenarios(model) : [];
  const partialRisk = partials.some((s) => !s.projection || s.projection.profit <= 0);
  useEffect(() => {
    if (!settings.data || initialized.current) return;
    initialized.current = true;
    const c = settings.data.strategy?.config as Partial<StrategyConfig> | undefined;
    setMargin(String(c?.maxSlippagePct ?? 1));
    setMaxGas(String(c?.maxGasGwei ?? 5));
    setMinLiquidity(String(c?.minLiquidityUsd ?? 5000));
    const rule = c?.chartRule;
    if (rule) {
      const es = rule.entries?.map((e) => e.priceBnb) ?? [rule.entryBnb];
      const xs = rule.exits?.map((e) => e.priceBnb) ?? [rule.exitBnb];
      setEntries(es);
      setEntryCount(es.length);
      setExitCount(xs.length);
      setManualExits(xs);
      const orders =
        rule.entries?.reduce((sum, e) => sum.plus(e.amountBnb), new Decimal(0)) ??
        new Decimal(c?.buyAmount ?? 0);
      setBudget(
        orders
          .plus(new Decimal(rule.gasBuyBnb).mul(es.length))
          .plus(new Decimal(rule.gasSellBnb).mul(xs.length))
          .toFixed(18, Decimal.ROUND_DOWN),
      );
    }
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (
        d?.version === (settings.data.strategy?.version ?? 0) &&
        d?.revision === (settings.data.draft?.revision ?? 0) &&
        typeof d.budget === "string" &&
        Number.isInteger(d.entryCount) &&
        d.entryCount >= 1 &&
        d.entryCount <= 10 &&
        Number.isInteger(d.exitCount) &&
        d.exitCount >= 1 &&
        d.exitCount <= 5 &&
        Array.isArray(d.entries) &&
        d.entries.length === d.entryCount &&
        d.entries.every((v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0)
      ) {
        setBudget(d.budget);
        setEntryCount(d.entryCount);
        setExitCount(d.exitCount);
        setEntries(d.entries);
        if (
          Array.isArray(d.exits) &&
          d.exits.length === d.exitCount &&
          d.exits.every((v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0)
        )
          setManualExits(d.exits);
        if (typeof d.target === "string") setTarget(d.target);
      }
    } catch {
      /* Optional scoped draft. Never restore authorizations or confirmations. */
    }
    setDraftReady(true);
  }, [settings.data, draftKey]);
  useEffect(() => {
    if (!draftReady || saved || started || !settings.data || !chosen) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          budget: chosen,
          entryCount,
          exitCount,
          entries,
          exits: manualExits,
          target,
          version: settings.data.strategy?.version ?? 0,
          revision: settings.data.draft?.revision ?? 0,
        }),
      );
    } catch {
      /* Optional local draft. */
    }
  }, [
    draftReady,
    saved,
    started,
    settings.data,
    draftKey,
    chosen,
    entryCount,
    exitCount,
    entries,
    manualExits,
    target,
  ]);
  const markedEntries = entries.filter((p) => p > 0).sort((a, b) => b - a);
  const breakEven =
    allocation && costsValid && markedEntries.length
      ? planProjection({
          ...costs!,
          entryPrices: markedEntries,
          amounts: allocation.amounts.slice(0, markedEntries.length),
          exitPrices: Array.from({ length: exitCount }, () => markedEntries[0]!),
        })?.breakEvenBnb
      : null;
  const changed = () => {
    setAck(false);
    setPartialAck(false);
    setSaved(false);
    setStartAck(false);
    setError("");
  };
  const levels: ChartLevel[] =
    bnbUsd == null
      ? []
      : [
          ...(breakEven
            ? [
                {
                  price: breakEven * bnbUsd,
                  label:
                    markedEntries.length === entryCount
                      ? "Equilíbrio do conjunto"
                      : "Equilíbrio das entradas marcadas",
                  tone: "avg" as const,
                },
              ]
            : []),
          ...entries.flatMap((p, i) =>
            p > 0
              ? [
                  {
                    id: `entry:${i}`,
                    draggable: step === 1,
                    price: p * bnbUsd,
                    label: `Entrada ${i + 1}`,
                    tone: "buy" as const,
                  },
                ]
              : [],
          ),
          ...(step >= 2
            ? exits.flatMap((p, i) =>
                p > 0
                  ? [
                      {
                        id: `exit:${i}`,
                        draggable: step === 2,
                        price: p * bnbUsd,
                        label: `Saída ${i + 1}`,
                        tone: "target" as const,
                      },
                    ]
                  : [],
              )
            : []),
          ...(stopChoice === "price" && stop > 0
            ? [
                {
                  id: "stop:0",
                  draggable: step === 2,
                  price: stop * bnbUsd,
                  label: "Stop",
                  tone: "stop" as const,
                },
              ]
            : []),
        ];
  const mark = (kind: "entry" | "exit" | "stop", index: number, priceUsd: number) => {
    if (!fresh || bnbUsd == null) return setError("Atualize a cotação antes de marcar os pontos.");
    const p = priceUsd / bnbUsd;
    if (!(p > 0) || !Number.isFinite(p)) return;
    changed();
    if (kind === "entry") setEntries((old) => old.map((v, i) => (i === index ? p : v)));
    else if (kind === "exit") setManualExits(exits.map((v, i) => (i === index ? p : v)));
    else setStop(p);
  };
  const updatePrice = (kind: "entry" | "exit" | "stop", index: number, value: string) => {
    if (rate != null) mark(kind, index, (numeric(value) / rate) * (bnbUsd ?? 0));
  };
  const validInput = chartPlanInputSchema.safeParse({
    budgetBnb: chosen,
    entryPrices: sortedEntries,
    exitPrices: [...exits].sort((a, b) => a - b),
    stopChoice,
    stopBnb: stopChoice === "price" ? stop : null,
    buyTaxPct: costs?.buyTaxPct,
    sellTaxPct: costs?.sellTaxPct,
    taxesConfirmed: taxReady || snapshot != null,
    gasBuyBnb: costs?.gasBuyBnb,
    gasSellBnb: costs?.gasSellBnb,
    executionMarginPct: costs?.executionMarginPct,
    maxGasGwei: numeric(maxGas),
    minLiquidityUsd: numeric(minLiquidity),
    acknowledge: ack,
    partialEntriesAccepted: partialAck,
  });
  const ready = useQuery({
    queryKey: ["chart-plan-readiness", userId, walletScope, token],
    queryFn: () => getBotReadiness({ data: { walletScope, token } }),
    enabled: saved && !started,
    retry: false,
  });
  const refresh = () => {
    void capital.refetch();
    void gas.refetch();
    void market.refetch();
    void fx.refetch();
  };
  const next = () => {
    setError("");
    if (step === 0) {
      if (!capitalFresh || available == null)
        return setError("Não foi possível confirmar o saldo livre. Atualize o disponível.");
      if (!allocation || new Decimal(chosen || 0).gt(available))
        return setError(
          "Escolha um valor que caiba no disponível e cubra a reserva estimada de gás.",
        );
      if (!costsValid || !taxReady)
        return setError(
          "Aguarde a consulta automática de custos ou informe as taxas nos detalhes.",
        );
      setBudget(chosen);
      setPartialAck(false);
      setSnapshot(liveCosts);
      setStep(1);
      setPick({ kind: "entry", index: 0 });
    } else if (step === 1) {
      if (!entries.every((p) => p > 0) || new Set(entries).size !== entryCount)
        return setError("Marque um preço diferente para cada entrada.");
      setEntries(sortedEntries);
      setPick(null);
      setStep(2);
    } else if (step === 2) {
      if (!stopChoice)
        return setError("Escolha explicitamente manter o stop ou ficar sem stop fixo.");
      const validation = chartPlanInputSchema.safeParse({
        ...(validInput.success
          ? validInput.data
          : {
              budgetBnb: chosen,
              entryPrices: sortedEntries,
              exitPrices: exits,
              stopChoice,
              stopBnb: stopChoice === "price" ? stop : null,
              ...costs,
              taxesConfirmed: true,
              maxGasGwei: numeric(maxGas),
              minLiquidityUsd: numeric(minLiquidity),
            }),
        acknowledge: true,
      });
      if (!validation.success)
        return setError(
          formIssueMessage(
            validation.error.issues[0]!,
            String(validation.error.issues[0]?.path[0] ?? "saídas e stop"),
          ),
        );
      if (!projection || projection.profit <= 0)
        return setError(
          "Com todas as entradas, as saídas escolhidas ainda não cobrem as taxas e o gás estimados. Confira o detalhamento. Seus pontos foram mantidos.",
        );
      setStep(3);
      setPick(null);
      setAck(false);
    }
  };
  const renderChart = () => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">
          {pick
            ? pick.kind === "stop"
              ? "Toque no gráfico para marcar o stop"
              : `${pick.kind === "entry" ? "Entrada" : "Saída"} ${pick.index + 1}: toque no gráfico`
            : "Arraste os pontos ↕ para ajustar"}
        </p>
        <Button variant="outline" size="sm" onClick={() => setPick(null)}>
          Mover gráfico
        </Button>
      </div>
      {!fresh && (
        <p role="status" className="text-sm text-warning">
          Aguardando cotação atual para marcar os pontos.
        </p>
      )}
      <CandleChart
        compact
        initialAllLevels
        candles={candles.data ?? []}
        history={candles.history}
        now={now}
        preferenceKey="cryptobot:chart-plan-view"
        levels={levels}
        liveQuote={fresh ? { price: usd, at: quoteAt } : undefined}
        pickingPrice={!!pick && fresh && !busy && !started}
        onPickPrice={(p) => {
          if (!pick) return;
          mark(pick.kind, pick.index, p.price);
          const count = pick.kind === "entry" ? entryCount : exitCount;
          setPick(
            pick.kind !== "stop" && pick.index + 1 < count
              ? { ...pick, index: pick.index + 1 }
              : null,
          );
        }}
        onEditLevel={
          fresh && !busy && !started
            ? (id, p) => {
                const [kind, index] = id.split(":");
                if (kind === "entry" || kind === "exit" || kind === "stop")
                  mark(kind, Number(index), p);
              }
            : undefined
        }
      />
      <p className="text-xs text-muted-foreground">
        O gráfico mantém os preços em US$. Os campos usam {currency}. Clicar marca; arrastar o fundo
        move o histórico. As ordens serão avaliadas no futuro, com preços fixados em BNB
        internamente.
      </p>
    </>
  );
  return (
    <div className="space-y-4">
      <nav className="grid grid-cols-4 gap-2 text-xs" aria-label="Etapas da atividade">
        {["Valor", "Entradas", "Saídas", "Revisão"].map((text, i) => (
          <div
            key={text}
            aria-current={step === i ? "step" : undefined}
            className={`rounded-xl p-2 text-center ${i === step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            {i + 1}. {text}
          </div>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          {walletName} · {symbol}
        </span>
        <label className="flex items-center gap-2 text-xs">
          Moeda dos valores
          <select
            aria-label="Moeda dos valores"
            className="rounded-xl bg-secondary p-2"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            <option value="BRL">R$ · Reais</option>
            <option value="USD">US$ · Dólares</option>
            <option value="EUR">€ · Euros</option>
            <option value="BNB">BNB</option>
          </select>
        </label>
      </div>
      {rate == null && (
        <p role="status" className="text-sm text-muted-foreground">
          Conversão indisponível nesta moeda. Atualize ou selecione US$ ou BNB.
        </p>
      )}
      {locked && (
        <p role="status" className="rounded-xl bg-warning/10 p-3 text-sm text-warning">
          Este token tem robô ligado ou posição aberta. Você pode estudar os pontos; substituir as
          regras exige pausar e encerrar a posição.
        </p>
      )}
      {settings.isError && (
        <p role="alert">
          Não foi possível carregar as regras.{" "}
          <Button variant="outline" onClick={() => void settings.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {!saved && step === 0 && (
        <section className="space-y-4" aria-label="Escolher valor e quantidade de entradas">
          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-sm text-muted-foreground">Disponível para esta atividade</p>
            <p className="mt-1 text-3xl font-semibold">
              {capital.isPending
                ? "Consultando…"
                : available == null
                  ? "Não apurado"
                  : money(available)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Somente BNB livre da carteira automática. Saldos em outros tokens e valores reservados
              para outros robôs não são usados nesta divisão.
            </p>
            <Button
              className="mt-2"
              variant="outline"
              size="sm"
              disabled={capital.isFetching}
              onClick={refresh}
            >
              Atualizar disponível
            </Button>
          </div>
          {capital.isError && (
            <p role="alert" className="text-sm">
              Não foi possível consultar o saldo. Nenhum valor foi considerado zero.
            </p>
          )}
          {capital.isSuccess && capital.data == null && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await createBotWallet({ data: { walletScope } });
                  if (mounted.current) void capital.refetch();
                } catch (e) {
                  if (mounted.current) setError(userMessage(e));
                } finally {
                  if (mounted.current) setBusy(false);
                }
              }}
            >
              Criar carteira automática
            </Button>
          )}
          {capital.data?.address && (
            <FundBotDialog
              botAddress={capital.data.address}
              sourceAddress={sourceAddress}
              onDone={() => void capital.refetch()}
            />
          )}
          <label className="block text-sm">
            Quanto deseja liberar? ({currency})
            <Input
              className="mt-1"
              aria-label="Valor para a atividade"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              disabled={rate == null || busy}
              value={rate != null && chosen ? exact(Number(chosen) * rate) : ""}
              onChange={(e) => {
                changed();
                setSnapshot(null);
                try {
                  setBudget(
                    e.target.value && rate
                      ? new Decimal(e.target.value).div(rate).toFixed(18, Decimal.ROUND_DOWN)
                      : "",
                  );
                } catch {
                  setBudget("");
                }
              }}
            />
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <Button
                key={pct}
                variant="outline"
                disabled={available == null || busy}
                onClick={() => {
                  changed();
                  setSnapshot(null);
                  setBudget(
                    new Decimal(available!).mul(pct).div(100).toFixed(18, Decimal.ROUND_DOWN),
                  );
                }}
              >
                {pct === 100 ? "Máximo" : `${pct}%`}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Quantas entradas?
              <select
                aria-label="Quantidade de entradas"
                className="mt-1 w-full rounded-xl bg-secondary p-3"
                value={entryCount}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  changed();
                  setSnapshot(null);
                  setEntryCount(n);
                  setEntries((old) => Array.from({ length: n }, (_, i) => old[i] ?? 0));
                  setManualExits(null);
                }}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Quantas saídas?
              <select
                aria-label="Quantidade de saídas"
                className="mt-1 w-full rounded-xl bg-secondary p-3"
                value={exitCount}
                onChange={(e) => {
                  changed();
                  setSnapshot(null);
                  setExitCount(Number(e.target.value));
                  setManualExits(null);
                }}
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {allocation ? (
            <div className="rounded-xl border p-3 text-sm">
              <p>
                Valor dividido: <b>{money(allocation.ordersBnb)}</b>
              </p>
              <p>
                Reserva estimada de gás: <b>{money(allocation.gasBnb)}</b>
              </p>
              <p className="mt-2">
                {entryCount} {entryCount === 1 ? "entrada de" : "entradas de aproximadamente"}{" "}
                <b>{money(allocation.amounts[0]!)}</b> cada. O arredondamento fica na última
                entrada.
              </p>
            </div>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {!taxReady
                ? tax.isFetching
                  ? "Consultando as taxas do token automaticamente…"
                  : "Falta confirmar as taxas do token nos detalhes abaixo."
                : !gas.data
                  ? "Consultando a referência de gás…"
                  : "O valor escolhido precisa cobrir a reserva estimada de gás e as entradas."}
            </p>
          )}
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm">
              Custos automáticos e ajustes opcionais
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              <p>
                Taxa do token: compra{" "}
                {buyTax == null || !Number.isFinite(buyTax) ? "não apurada" : `${buyTax}%`} · venda{" "}
                {sellTax == null || !Number.isFinite(sellTax) ? "não apurada" : `${sellTax}%`}. DEX:
                0,25% por operação. Gás é uma referência ao preço atual da rede, usando 300 mil
                unidades na compra e 460 mil na aprovação/venda; a cobrança real pode variar.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={tax.isFetching}
                onClick={() => void tax.refetch()}
              >
                Consultar taxas novamente
              </Button>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  Informar taxa de compra (%)
                  <Input
                    aria-label="Taxa de compra manual"
                    type="number"
                    min="0"
                    max="99.99"
                    step="any"
                    value={manualBuy}
                    onChange={(e) => {
                      setManualBuy(e.target.value);
                      setManualTaxConfirmed(false);
                      setSnapshot(null);
                    }}
                  />
                </label>
                <label>
                  Informar taxa de venda (%)
                  <Input
                    aria-label="Taxa de venda manual"
                    type="number"
                    min="0"
                    max="99.99"
                    step="any"
                    value={manualSell}
                    onChange={(e) => {
                      setManualSell(e.target.value);
                      setManualTaxConfirmed(false);
                      setSnapshot(null);
                    }}
                  />
                </label>
              </div>
              {manualTaxes && (
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={manualTaxConfirmed}
                    onChange={(e) => setManualTaxConfirmed(e.target.checked)}
                  />
                  Confirmo as taxas informadas, inclusive quando forem zero.
                </label>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  Tolerância de execução/slippage (%)
                  <Input
                    aria-label="Margem de execução"
                    type="number"
                    min="0"
                    max="20"
                    step="any"
                    value={margin}
                    onChange={(e) => {
                      setMargin(e.target.value);
                      setSnapshot(null);
                    }}
                  />
                </label>
                <label>
                  Teto de gás (gwei)
                  <Input
                    aria-label="Teto de gás"
                    type="number"
                    min="0"
                    step="any"
                    value={maxGas}
                    onChange={(e) => setMaxGas(e.target.value)}
                  />
                </label>
                <label>
                  Gás estimado por compra (BNB)
                  <Input
                    aria-label="Gás por compra"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={gas.data?.gasBuyBnb ?? "Não apurado"}
                    value={gasBuyOverride}
                    onChange={(e) => {
                      setGasBuyOverride(e.target.value);
                      setSnapshot(null);
                    }}
                  />
                </label>
                <label>
                  Gás estimado por saída (BNB)
                  <Input
                    aria-label="Gás por saída"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={gas.data?.gasSellBnb ?? "Não apurado"}
                    value={gasSellOverride}
                    onChange={(e) => {
                      setGasSellOverride(e.target.value);
                      setSnapshot(null);
                    }}
                  />
                </label>
                <label>
                  Liquidez mínima (US$)
                  <Input
                    aria-label="Liquidez mínima"
                    type="number"
                    min="0"
                    step="any"
                    value={minLiquidity}
                    onChange={(e) => setMinLiquidity(e.target.value)}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Taxa desconhecida não é zero. Conversões são estimativas e não alteram o saldo real.
                Para novos custos, use Atualizar disponível antes de continuar.
              </p>
            </div>
          </details>
        </section>
      )}
      {!saved && step === 1 && (
        <section className="space-y-3" aria-label="Marcar entradas">
          <h3 className="text-lg font-semibold">Escolha os {entryCount} pontos de entrada</h3>
          <p className="text-sm text-muted-foreground">
            Toque uma vez para cada entrada. A execução segue do maior preço para o menor. O sistema
            já dividiu o valor liberado; cada ponto será usado apenas uma vez.
          </p>
          {renderChart()}
          <ol className="grid gap-2 sm:grid-cols-2">
            {entries.map((p, i) => (
              <li key={i} className="rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <b>
                    Entrada {i + 1} · {allocation ? money(allocation.amounts[i]!) : "Não apurado"}
                  </b>
                  <Button
                    variant={pick?.kind === "entry" && pick.index === i ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPick({ kind: "entry", index: i })}
                  >
                    Marcar {i + 1}
                  </Button>
                </div>
                <label className="mt-2 block">
                  Preço de entrada ({currency})
                  <Input
                    aria-label={`Preço da entrada ${i + 1}`}
                    type="number"
                    min="0"
                    step="any"
                    value={p > 0 && rate != null ? exact(p * rate) : ""}
                    onChange={(e) => updatePrice("entry", i, e.target.value)}
                  />
                </label>
                <p className="mt-1 text-xs text-muted-foreground">{priceText(p)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!saved && step === 2 && (
        <section className="space-y-3" aria-label="Definir saídas">
          <h3 className="text-lg font-semibold">Saídas prontas para revisar</h3>
          <p className="text-sm text-muted-foreground">
            A sugestão considera o preço médio das {entryCount} entradas, as taxas e o gás estimado.
            Você escolhe os preços de saída. O resultado de compras incompletas aparece separado.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Meta líquida inicial (%)
              <Input
                aria-label="Meta líquida inicial"
                className="mt-1"
                type="number"
                min="0"
                step="any"
                value={target}
                onChange={(e) => {
                  changed();
                  setTarget(e.target.value);
                }}
              />
            </label>
            <Button
              variant="outline"
              onClick={() => {
                changed();
                setManualExits(null);
              }}
            >
              Aplicar sugestão às saídas
            </Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {manualExits
              ? "Saídas definidas por você. Alterar a meta não muda esses preços; use Aplicar sugestão se desejar substituí-los."
              : "Saídas sugeridas. Ao ajustar um preço, ele passa a ser manual e será mantido."}
          </p>
          {renderChart()}
          <ol className="grid gap-2 sm:grid-cols-2">
            {exits.map((p, i) => (
              <li key={i} className="rounded-xl border p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <b>
                    Saída {i + 1} · {formatDistancePct(shares[i]!)} da posição
                  </b>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPick({ kind: "exit", index: i })}
                  >
                    Ajustar {i + 1}
                  </Button>
                </div>
                <label className="mt-2 block">
                  Preço de saída ({currency})
                  <Input
                    aria-label={`Preço da saída ${i + 1}`}
                    type="number"
                    min="0"
                    step="any"
                    value={rate != null ? exact(p * rate) : ""}
                    onChange={(e) => updatePrice("exit", i, e.target.value)}
                  />
                </label>
              </li>
            ))}
          </ol>
          <fieldset className="space-y-2 rounded-xl border p-3">
            <legend className="px-1 font-semibold">Deseja usar stop?</legend>
            <label className="flex gap-2 text-sm">
              <input
                type="radio"
                name="chart-plan-stop"
                checked={stopChoice === "price"}
                onChange={() => {
                  changed();
                  setStopChoice("price");
                  setStop(Math.min(...entries) * 0.85);
                }}
              />
              Sim, usar um limite de queda.
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="radio"
                name="chart-plan-stop"
                checked={stopChoice === "none"}
                onChange={() => {
                  changed();
                  setStopChoice("none");
                  setStop(0);
                }}
              />
              Manter os tokens sem stop fixo.
            </label>
            {stopChoice === "price" && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  Preço do stop ({currency})
                  <Input
                    aria-label="Preço do stop"
                    type="number"
                    min="0"
                    step="any"
                    value={rate != null ? exact(stop * rate) : ""}
                    onChange={(e) => updatePrice("stop", 0, e.target.value)}
                  />
                </label>
                <Button variant="outline" onClick={() => setPick({ kind: "stop", index: 0 })}>
                  Marcar stop no gráfico
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Com stop, a venda pode realizar prejuízo e custos podem aumentar a perda. Sem stop, o
              token pode perder todo o valor; recuperação não é garantida.
            </p>
          </fieldset>
        </section>
      )}
      {!saved && step === 3 && allocation && (
        <section className="space-y-4" aria-label="Revisão da atividade">
          <h3 className="text-lg font-semibold">Confira sua atividade</h3>
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-secondary p-4 text-sm">
            <div>
              <dt>Valor liberado</dt>
              <dd className="font-semibold">{money(chosen)}</dd>
            </div>
            <div>
              <dt>Reserva estimada de gás</dt>
              <dd>{money(allocation.gasBnb)}</dd>
            </div>
            <div>
              <dt>Dividido nas {entryCount} entradas</dt>
              <dd>{money(allocation.ordersBnb)}</dd>
            </div>
            <div>
              <dt>Stop</dt>
              <dd>{stopChoice === "none" ? "Sem stop fixo" : priceText(stop)}</dd>
            </div>
          </dl>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="font-semibold">Entradas</h4>
              <ol className="mt-2 space-y-2 text-sm">
                {sortedEntries.map((p, i) => (
                  <li key={i}>
                    {i + 1}. {money(allocation.amounts[i]!)} · {priceText(p)}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h4 className="font-semibold">Saídas</h4>
              <ol className="mt-2 space-y-2 text-sm">
                {[...exits]
                  .sort((a, b) => a - b)
                  .map((p, i) => (
                    <li key={i}>
                      {i + 1}. {priceText(p)} · {formatDistancePct(shares[i]!)}
                    </li>
                  ))}
              </ol>
            </div>
          </div>
          <p className="text-sm">
            Ao começar a vender, entradas ainda não realizadas são canceladas. Se o preço cruzar
            vários níveis de saída de uma vez, eles podem ser vendidos juntos. Após encerrar, não há
            recompra automática.
          </p>
          {fresh && sortedEntries[0]! >= native && (
            <p className="text-sm text-warning">
              O preço atual já pode atender a primeira entrada. Iniciar poderá gerar uma compra na
              próxima avaliação.
            </p>
          )}
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            Revisei carteira, valor, entradas, saídas, taxas e stop. Entendo que as projeções não
            garantem lucro e que executar leva tempo.
          </label>
          <Button
            disabled={
              busy ||
              !ack ||
              (partialRisk && !partialAck) ||
              !validInput.success ||
              locked ||
              !fresh ||
              !capitalFresh
            }
            onClick={async () => {
              if (!validInput.success || !settings.data) return;
              setBusy(true);
              setError("");
              try {
                await saveChartPlan({
                  data: {
                    walletScope,
                    token,
                    settings: validInput.data,
                    version: settings.data.strategy?.version ?? 0,
                    draftRevision: settings.data.draft?.revision ?? 0,
                  },
                });
                if (!mounted.current) return;
                setSaved(true);
                try {
                  localStorage.removeItem(draftKey);
                } catch {
                  /* Optional storage. */
                }
                await settings.refetch();
                await capital.refetch();
                await onSaved?.();
              } catch (e) {
                if (mounted.current) setError(userMessage(e));
              } finally {
                if (mounted.current) setBusy(false);
              }
            }}
          >
            Salvar atividade · manter pausado
          </Button>
        </section>
      )}
      {!saved && step >= 2 && projection && allocation && costs && (
        <section
          aria-label="Resultado e custos das saídas"
          className="space-y-3 rounded-xl border p-3 text-sm"
        >
          <h3 className="font-semibold">Com todas as {entryCount} entradas</h3>
          <p>
            Preço médio das compras: <b>{priceText(projection.averageBnb)}</b>
          </p>
          <p>
            Equilíbrio estimado do conjunto: <b>{priceText(projection.breakEvenBnb)}</b>
          </p>
          <p>
            Ganho bruto pelos preços escolhidos: <b>{money(projection.grossProfit)}</b>
          </p>
          <p>
            Taxas e gás estimados: <b>{money(projection.feeCost)}</b>
          </p>
          <p className="text-xs text-muted-foreground">
            Token: compra {costs.buyTaxPct}% / venda {costs.sellTaxPct}%. Troca: 0,25% por operação.
            Gás: {money(allocation.gasBnb)}.
          </p>
          <p>
            Resultado líquido estimado:{" "}
            <b className={projection.profit > 0 ? "text-success" : "text-destructive"}>
              {money(projection.profit)} · {formatDistancePct(projection.netPct)}
            </b>
          </p>
          <div className="space-y-2">
            {entryResults.map((r, i) => (
              <div key={i} className="rounded-lg bg-secondary p-2">
                <b>Entrada {i + 1}</b> · alta bruta {formatDistancePct(r.grossPct)}
                <p>
                  Resultado estimado após custos:{" "}
                  <span className={r.profit > 0 ? "text-success" : "text-destructive"}>
                    {money(r.profit)} · {formatDistancePct(r.netPct)}
                  </span>
                </p>
              </div>
            ))}
          </div>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">O que entra nessa conta?</summary>
            <div className="mt-2 space-y-2">
              <p>
                Taxa do token: {costs.buyTaxPct}% na compra e {costs.sellTaxPct}% na venda.
              </p>
              <p>Taxa da troca: 0,25% em cada compra e venda.</p>
              <p>
                Gás estimado: {money(costs.gasBuyBnb * entryCount)} nas {entryCount} compras +{" "}
                {money(costs.gasSellBnb * exitCount)} nas {exitCount} saídas.
              </p>
              <p>
                Reserva para gás: {money(allocation.gasBnb)}. É o mesmo gás acima, separado do valor
                das compras; não é descontado duas vezes.
              </p>
              <p>
                Margem/slippage de {costs.executionMarginPct}% é uma tolerância de execução, não uma
                taxa fixa. Não é descontada como cobrança obrigatória no resultado acima.
              </p>
              {adverse && (
                <p>
                  Se a execução piorar toda essa margem na compra e na venda:{" "}
                  <b>
                    {money(adverse.profit)} · {formatDistancePct(adverse.netPct)}
                  </b>
                  . Esse cenário não move seus pontos.
                </p>
              )}
              <p>
                Com várias saídas, o resultado de cada entrada combina os preços e percentuais das
                vendas. O gás das vendas é dividido proporcionalmente ao valor investido.
              </p>
            </div>
          </details>
          {partials.length > 0 && (
            <details className="rounded-lg border p-3" open={partialRisk ? true : undefined}>
              <summary className="cursor-pointer font-medium">
                Se nem todas as compras acontecerem
              </summary>
              <div className="mt-2 space-y-2">
                {partials.map((s) => (
                  <p key={s.entries}>
                    Com apenas {s.entries} {s.entries === 1 ? "entrada" : "entradas"}:{" "}
                    <b
                      className={
                        s.projection && s.projection.profit > 0
                          ? "text-success"
                          : "text-destructive"
                      }
                    >
                      {s.projection
                        ? `${money(s.projection.profit)} · ${formatDistancePct(s.projection.netPct)}`
                        : "Não apurado"}
                    </b>
                    .
                  </p>
                ))}
                <p>
                  São cenários separados. Eles não aumentam automaticamente o preço da sua saída.
                </p>
              </div>
            </details>
          )}
          {partialRisk && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={partialAck}
                onChange={(e) => setPartialAck(e.target.checked)}
              />
              Entendo que, se apenas parte das compras ocorrer, estas saídas podem gerar prejuízo
              após custos. Quero manter os preços escolhidos.
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Estimativas em BNB convertidas para {currency}. Gás, taxas, impacto de preço, variação
            do BNB e condições reais podem alterar o resultado. Não há garantia de lucro.
          </p>
        </section>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!saved && (
        <div className="flex justify-between gap-3">
          {step > 0 ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setStep(step - 1);
                setAck(false);
                setError("");
                if (step === 1) setSnapshot(null);
              }}
            >
              Voltar
            </Button>
          ) : (
            <span />
          )}
          {step < 3 && (
            <Button
              disabled={
                busy ||
                settings.isPending ||
                settings.isError ||
                (step === 0 && (!capitalFresh || rate == null || !allocation || !taxReady))
              }
              onClick={next}
            >
              {step === 0
                ? "Dividir valor e marcar entradas"
                : step === 1
                  ? "Continuar para saídas"
                  : "Revisar atividade"}
            </Button>
          )}
        </div>
      )}
      {saved && (
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="font-semibold">
            {started ? "Robô iniciado" : "Atividade salva · robô pausado"}
          </h3>
          <p className="text-sm">
            Iniciar é uma ação separada. Verificações programadas ~2 segundos, mais consultas e
            rede; o preço final pode variar.
          </p>
          {ready.data?.errors.map((m, i) => (
            <p key={i} className="text-sm text-warning">
              {userMessage(m)}
            </p>
          ))}
          <Button
            variant="outline"
            disabled={ready.isFetching || started}
            onClick={() => void ready.refetch()}
          >
            Conferir saldo e condições
          </Button>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={startAck}
              disabled={busy || started}
              onChange={(e) => setStartAck(e.target.checked)}
            />
            Autorizo iniciar esta atividade nesta carteira e token.
          </label>
          <Button
            disabled={busy || started || !startAck || !ready.data?.ready || ready.isFetching}
            onClick={async () => {
              setBusy(true);
              try {
                await startGuidedBot({
                  data: { walletScope, token, confirmation: "INICIAR ROBÔ" },
                });
                if (mounted.current) {
                  setStarted(true);
                  await onSaved?.();
                }
              } catch (e) {
                if (mounted.current) {
                  setError(userMessage(e));
                  void ready.refetch();
                }
              } finally {
                if (mounted.current) setBusy(false);
              }
            }}
          >
            Iniciar este robô
          </Button>
          <Button variant="outline" asChild>
            <Link to="/grade" search={{ token, carteira: walletScope }} onClick={onClose}>
              Abrir robô
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}
