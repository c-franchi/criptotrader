import { BotRuleHelp, BotRulesGuide, type GuidedRule } from "./BotRulesGuide";
import { StopLossDecision } from "./StopLossDecision";
import { WalletPicker } from "./WalletPicker";
import type { ReadinessAction } from "@/lib/readinessIssues";
import { useCurrency } from "@/hooks/currencyContext";
import { TokenPicker } from "@/components/TokenPicker";
import { getTokenTax } from "@/lib/userTokens.functions";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  getGuidedBotSettings,
  saveGuidedBot,
  startGuidedBot,
  getBotReadiness,
} from "@/lib/guidedBot.functions";
import { getMarket } from "@/lib/chain.functions";
import { getWalletCapital } from "@/lib/capital.functions";
import { readSetupDraft, writeSetupDraft, removeSetupDraft, setupDraftKey } from "@/lib/setupDraft";
import { getFxQuote } from "@/lib/fx.functions";
import { createBotWallet, getExecutionStatus, type getBotWallet } from "@/lib/bot.functions";
import {
  guidedInputSchema,
  incompatibleBotToken,
  INCOMPATIBLE_BNB,
  type GuidedInput,
  type GuidedModel,
} from "@/lib/guidedBot";
import type { StrategyConfig } from "@/lib/strategy";
import { FundBotDialog } from "./FundBotDialog";
import { BotReadiness } from "./BotReadiness";
import { useCandles } from "@/hooks/useCandles";
import { CandleChart } from "./CandleChart";

type Wallet = Awaited<ReturnType<typeof getBotWallet>>;
type GuidedForm = Omit<GuidedInput, "taxConfirmed"> & { taxConfirmed: boolean };
const initial: GuidedForm = {
  model: "dca",
  capital: 0,
  buyAmount: 0,
  dropPct: 5,
  maFast: 9,
  maSlow: 21,
  maxEntries: 1,
  cooldownMin: 60,
  maxTradesPerDay: 3,
  profitPct: 4,
  stopPct: 8,
  allowNoStop: false,
  reserve: 0.0001,
  minLiquidityUsd: 5000,
  maxGasGwei: 5,
  buyTax: 0,
  sellTax: 0,
  taxConfirmed: false,
  lower: 0,
  upper: 0,
  levels: 5,
  reboundPct: 1,
  maxReboundPct: 3,
  confirmationBars: 2,
};
function NumberField({
  label,
  value,
  onChange,
  hint,
  field,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  field?: string;
}) {
  const id = useId();
  return (
    <div className="text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        data-setup-field={field}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1"
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        value={
          value
            ? value.toLocaleString("en-US", { maximumFractionDigits: 18, useGrouping: false })
            : ""
        }
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <BotRuleHelp field={{ key: field ?? label, label, value, onChange }} />
      {hint && (
        <details className="setup-hint mt-1 font-normal">
          <summary>Como funciona</summary>
          <p id={`${id}-hint`}>{hint}</p>
        </details>
      )}
    </div>
  );
}
function SetupChart({ pool, token }: { pool: string | undefined; token: string }) {
  const candles = useCandles(pool, token);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="border-b pb-4">
      <CandleChart
        compact
        history={candles.history}
        candles={candles.data ?? []}
        now={now}
        preferenceKey="cryptobot:setup-chart"
      />
    </div>
  );
}
export function GuidedBotSetup({
  open,
  onOpenChange,
  walletScope,
  userId,
  walletName,
  sourceAddress,
  token,
  symbol,
  wallet,
  onDone,
  tokens,
  onSelectToken,
  walletOptions,
  onSelectWallet,
  problemTarget,
  onExecutionIssue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  walletScope: string;
  userId: string;
  walletName: string;
  sourceAddress?: string | null | undefined;
  token: string;
  symbol: string;
  wallet: Wallet | null;
  onDone: () => Promise<void>;
  tokens?: { address: string; symbol: string }[];
  onSelectToken?: (address: string) => void;
  walletOptions?: { id: string; label: string }[];
  onSelectWallet?: (id: string) => void;
  problemTarget?: ReadinessAction | undefined;
  onExecutionIssue?: () => void;
}) {
  const [step, setStep] = useState(0),
    [form, setForm] = useState(initial),
    [version, setVersion] = useState(0),
    [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [ack, setAck] = useState(false),
    [locked, setLocked] = useState(false),
    [currency, setCurrency] = useState<"BNB" | "BRL">("BNB");
  const [guideOpen, setGuideOpen] = useState(false);
  const [askStop, setAskStop] = useState(false);
  const session = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const goToField = (field: string) => {
    setStep(
      ["token"].includes(field)
        ? 0
        : ["capital", "buyAmount", "maxEntries", "reserve", "wallet"].includes(field)
          ? 1
          : 2,
    );
    setSaved(false);
    setAck(false);
    setFocusField(field);
    setError("");
  };
  const resolveProblem = (action: ReadinessAction = "rules") => {
    if (action === "execution" && onExecutionIssue) {
      onExecutionIssue();
      return;
    }
    goToField(
      {
        token: "token",
        values: "capital",
        liquidity: "minLiquidityUsd",
        fees: "buyTax",
        rules: "profitPct",
        fund: "wallet",
        costs: "profitPct",
        range: "lower",
        gas: "maxGasGwei",
        execution: "wallet",
        refresh: "profitPct",
      }[action],
    );
  };
  useEffect(() => {
    if (!focusField || !loaded || !open) return;
    const el = dialogRef.current?.querySelector<HTMLElement>(`[data-setup-field="${focusField}"]`);
    if (!el) return;
    const details = el.closest("details");
    if (details) details.open = true;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
    setFocusField(null);
  }, [focusField, step, loaded, open]);
  useEffect(() => {
    if (open && loaded && problemTarget) resolveProblem(problemTarget);
    // Destination applies once when the saved editor finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded, problemTarget]);
  const [loadedKey, setLoadedKey] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const draftKey = setupDraftKey(userId, walletScope, token);
  const { currency: displayCurrency } = useCurrency();
  const fiatUnit = displayCurrency === "BRL" ? "R$" : displayCurrency === "USD" ? "US$" : "€";
  const qc = useQueryClient();
  const capital = useQuery({
    queryKey: ["guided-wallet-capital", userId, walletScope],
    queryFn: async () => {
      const [report, execution] = await Promise.all([
        getWalletCapital({ data: { walletScope } }),
        getExecutionStatus({ data: { walletScope } }),
      ]);
      return { report, locked: execution.locked };
    },
    enabled: open && !!userId,
    refetchInterval: 15000,
    staleTime: 0,
    retry: false,
  });
  const market = useQuery({
    queryKey: ["market", token],
    queryFn: () => getMarket({ data: { address: token } }),
    enabled: open,
    staleTime: 10000,
    retry: false,
  });
  const fx = useQuery({
    queryKey: ["fx-guided"],
    queryFn: () => getFxQuote(),
    enabled: open,
    staleTime: 60000,
  });
  const fiatRate =
    displayCurrency === "USD" ? 1 : displayCurrency === "BRL" ? fx.data?.usdBrl : fx.data?.usdEur;
  const rate = fx.data?.bnbUsd && fiatRate ? fx.data.bnbUsd * fiatRate : null;
  const readiness = useQuery({
    queryKey: ["bot-readiness", userId, walletScope, token],
    queryFn: () => getBotReadiness({ data: { walletScope, token } }),
    enabled: open && saved,
    refetchInterval: 30000,
    retry: false,
  });
  useEffect(() => {
    session.current += 1;
    if (!open) return;
    let alive = true;
    const local = readSetupDraft(draftKey, initial);
    setLoaded(false);
    setGuideOpen(false);
    setAskStop(false);
    setConflict(false);
    setSaved(false);
    setStep(0);
    setError("");
    setAck(false);
    setCurrency("BNB");
    getGuidedBotSettings({ data: { walletScope, token } })
      .then((r) => {
        if (!alive) return;
        const c = (r.draft?.config ?? r.strategy?.config ?? {}) as Partial<StrategyConfig>;
        const tp = c.takeProfits?.[0]?.pct;
        const taxRetention = (1 - (c.buyTaxPct ?? 0) / 100) * (1 - (c.sellTaxPct ?? 0) / 100);
        const serverForm: GuidedForm = {
          ...initial,
          model:
            r.bot?.mode === "grade"
              ? "grid"
              : c.recovery?.enabled
                ? "recovery"
                : c.entryType === "medias"
                  ? "trend"
                  : "dca",
          capital: c.allocationBnb ?? c.maxExposureQuote ?? 0,
          buyAmount: c.sizingMode === "fixo" ? (c.buyAmount ?? 0) : 0,
          dropPct: c.dropPct || c.recovery?.minDropPct || 5,
          maFast: c.maFast ?? 9,
          maSlow: c.maSlow ?? 21,
          maxEntries: c.maxEntries ?? 1,
          cooldownMin: c.cooldownMin ?? 60,
          maxTradesPerDay: c.maxTradesPerDay || 3,
          profitPct: tp ? Math.max(0, ((1 + tp / 100) * taxRetention - 1) * 100) : 4,
          stopPct: c.stopLossPct ?? 8,
          allowNoStop: c.stopLossPct === 0,
          reserve: c.gasReserveBnb ?? 0.0001,
          minLiquidityUsd: c.minLiquidityUsd ?? 5000,
          maxGasGwei: c.maxGasGwei ?? 5,
          buyTax: c.buyTaxPct ?? 0,
          sellTax: c.sellTaxPct ?? 0,
          taxConfirmed: c.taxVerified === true,
          lower: Number(r.bot?.lower_price ?? 0),
          upper: Number(r.bot?.upper_price ?? 0),
          levels: r.bot?.levels ?? 5,
          reboundPct: c.recovery?.reboundPct ?? 1,
          maxReboundPct: c.recovery?.maxReboundPct ?? 3,
          confirmationBars: c.recovery?.confirmationBars ?? 2,
        };
        setForm(local?.form ?? serverForm);
        setStep(local?.step ?? 0);
        setCurrency(local?.currency ?? "BNB");
        const serverVersion = r.strategy?.version ?? 0;
        const serverRevision = r.draft?.revision ?? 0;
        setConflict(
          !!local && (local.version !== serverVersion || local.revision !== serverRevision),
        );
        setVersion(local?.version ?? serverVersion);
        setRevision(local?.revision ?? serverRevision);
        setLoadedKey(draftKey);
        const state = r.bot?.strat_state as { tokens?: number; costBnb?: number } | null;
        setLocked(
          !!r.bot?.armed || Number(state?.tokens ?? 0) > 0 || Number(state?.costBnb ?? 0) > 0,
        );
        setLoaded(true);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      session.current += 1;
    };
  }, [open, walletScope, token, draftKey, reload]);
  useEffect(() => {
    if (!open || !loaded || loadedKey !== draftKey || saved) return;
    setStorageFailed(!writeSetupDraft(draftKey, { form, step, currency, version, revision }));
  }, [open, loaded, loadedKey, draftKey, saved, form, step, currency, version, revision]);
  const close = (next: boolean) => {
    if (!next && loaded && loadedKey === draftKey && !saved)
      writeSetupDraft(draftKey, { form, step, currency, version, revision });
    onOpenChange(next);
  };
  const set = <K extends keyof GuidedForm>(k: K, v: GuidedForm[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setSaved(false);
    setAck(false);
  };
  const validation = guidedInputSchema.safeParse(form);
  const issue = validation.success
    ? ""
    : validation.error.issues[0]?.path[0] === "taxConfirmed"
      ? "Confirme as taxas da moeda antes de continuar."
      : (validation.error.issues[0]?.message ?? "Revise os campos.");
  const unsupported = incompatibleBotToken(token);
  const compatible = market.data?.pools.some((p) => p.supported && Number(p.priceUsd) > 0);
  const amount = (n: number) => (currency === "BRL" && rate ? Number((n * rate).toFixed(2)) : n);
  const fromInput = (n: number) => (currency === "BRL" && rate ? n / rate : n);
  const quote = (n: number) =>
    `${n.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} BNB${rate ? ` (≈ ${(n * rate).toLocaleString("pt-BR", { style: "currency", currency: displayCurrency })})` : ""}`;
  const guideKeys: [keyof GuidedForm, string][] = [
    ["capital", "Capital máximo (BNB)"],
    ["buyAmount", "Valor por compra (BNB)"],
    ...(form.model === "grid"
      ? ([
          ["lower", "Mínimo da faixa (BNB/token)"],
          ["upper", "Máximo da faixa (BNB/token)"],
          ["levels", "Intervalos da grade"],
        ] as [keyof GuidedForm, string][])
      : form.model === "trend"
        ? ([
            ["maFast", "Média rápida (velas)"],
            ["maSlow", "Média lenta (velas)"],
          ] as [keyof GuidedForm, string][])
        : ([["dropPct", "Queda antes da entrada (%)"]] as [keyof GuidedForm, string][])),
    ...(form.model === "dca" || form.model === "trend"
      ? ([["maxEntries", "Máximo de compras por posição"]] as [keyof GuidedForm, string][])
      : []),
    ...(form.model === "recovery"
      ? ([
          ["reboundPct", "Recuperação mínima (%)"],
          ["maxReboundPct", "Recuperação máxima (%)"],
          ["confirmationBars", "Fechamentos em alta"],
        ] as [keyof GuidedForm, string][])
      : []),
    ["profitPct", "Meta após taxas do token (%)"],
    ["stopPct", "Stop-loss fixo (0 = desligado)"],
    ["reserve", "Reserva de gás (BNB)"],
    ["buyTax", "Taxa do token na compra (%)"],
    ["sellTax", "Taxa do token na venda (%)"],
    ["cooldownMin", "Intervalo entre compras (min)"],
    ["maxTradesPerDay", "Limite diário para novas entradas"],
    ["minLiquidityUsd", "Liquidez mínima (US$)"],
    ["maxGasGwei", "Teto de gás (gwei)"],
  ];
  const guideFields: GuidedRule[] = guideKeys.map(([key, label]) => ({
    key,
    label,
    value: Number(form[key] ?? 0),
    onChange: (n) => {
      set(key, n);
      if (key === "stopPct") set("allowNoStop", n === 0);
    },
  }));
  const createWallet = async () => {
    setBusy(true);
    try {
      await createBotWallet({ data: { walletScope } });
      await capital.refetch();
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (conflict)
      return setError("As regras salvas mudaram. Revise a atualização antes de salvar.");
    if (!validation.success) return setError(issue);
    const savingSession = session.current;
    setBusy(true);
    setError("");
    try {
      await saveGuidedBot({
        data: { walletScope, token, settings: validation.data, version, draftRevision: revision },
      });
      const pending = readSetupDraft(draftKey, initial);
      if (pending && JSON.stringify(pending.form) === JSON.stringify(form))
        removeSetupDraft(draftKey);
      if (session.current === savingSession) {
        setVersion((v) => v + 1);
        setRevision(0);
        setSaved(true);
        setAskStop(false);
      } else {
        // A reopened editor must fetch the confirmed version, without discarding newer input.
        setReload((n) => n + 1);
      }
      await qc.invalidateQueries({ queryKey: ["bot-readiness", userId, walletScope, token] });
      await qc.invalidateQueries({ queryKey: ["wallet-capital", walletScope] });
      await onDone();
      toast.success("Regras e robô salvos juntos. O robô continua pausado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    if (!ack || !saved) return;
    setBusy(true);
    setError("");
    try {
      await startGuidedBot({ data: { walletScope, token, confirmation: "INICIAR ROBÔ" } });
      await onDone();
      onOpenChange(false);
      toast.success("Robô iniciado com as regras revisadas.");
    } catch (e) {
      setError((e as Error).message);
      void readiness.refetch();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        ref={dialogRef}
        className="exchange-workspace exchange-setup max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-4 sm:p-6 [&>button.absolute]:size-11 [&>button.absolute]:grid [&>button.absolute]:place-items-center"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="pr-10">
          <DialogTitle>Configurar robô · {symbol}</DialogTitle>
          <DialogDescription>
            {symbol} / BNB · {walletName}
          </DialogDescription>
        </DialogHeader>
        <BotRulesGuide
          open={open && guideOpen}
          onOpenChange={setGuideOpen}
          fields={guideFields}
          summary={[
            form.model === "dca"
              ? "Compra por queda da referência de 24h; não é DCA por calendário. Não exige compra imediata ao iniciar."
              : form.model === "trend"
                ? "Exige tendência de alta pelas médias e recuo até a média lenta, com novo sinal após rearme. Não compra só por haver queda nem prevê retomada."
                : form.model === "grid"
                  ? "Grade em BNB por token, sujeita às saídas configuradas. Lucro nas vendas não elimina prejuízo nos tokens mantidos."
                  : "Espera queda e recuperação com velas fechadas. Uma entrada por fundo, sem recompras enquanto houver posição.",
            "Verificações programadas a cada cerca de 2 segundos, com tempo adicional de consultas, fila, aprovação e rede. Tocar no preço não garante envio imediato nem execução naquele valor. As condições por velas fechadas continuam exigidas.",
            "Todas as entradas dependem de saldo, custos, liquidez, intervalo e limites. O histórico do gráfico não substitui a cotação de execução.",
            "Média de referência dos gatilhos = soma de preço observado na entrada × quantidade recebida, dividida pela quantidade acumulada. Custo contábil por token = BNB efetivamente gasto dividido pelos tokens recebidos; são medidas diferentes.",
            "Resultado final = recebimentos menos custo dos tokens vendidos e custos de execução, sem duplicar taxas. A meta não garante resultado positivo.",
            "Velas de 15 minutos e referência de 24h. A execução usa BNB; ganhar BNB não garante ganho em reais. Salvar mantém o bot pausado; iniciar exige confirmação separada.",
          ]}
        />
        <StopLossDecision
          open={open && askStop}
          onOpenChange={setAskStop}
          value={form.stopPct}
          onChange={(n) => {
            set("stopPct", n);
            set("allowNoStop", n === 0);
          }}
          onConfirm={() => void save()}
          busy={busy}
          buyTax={form.buyTax}
          sellTax={form.sellTax}
        />
        {loaded && !saved && (
          <p className="text-xs text-muted-foreground" role="status">
            {storageFailed
              ? "O navegador não permitiu guardar o preenchimento. Salve as regras antes de sair da página."
              : "Rascunho salvo · fechar não inicia o robô."}
          </p>
        )}
        {conflict && (
          <div role="alert" className="rounded border border-warning p-3 text-sm">
            <p>
              As regras foram alteradas em outra sessão. Seu preenchimento foi preservado; confira
              as regras atuais antes de substituir.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                removeSetupDraft(draftKey);
                setLoaded(false);
                setReload((n) => n + 1);
              }}
            >
              Descartar preenchimento e carregar regras atuais
            </Button>
          </div>
        )}
        <div className="trade-tabs text-sm" aria-label="Etapas">
          <button
            type="button"
            aria-selected={step < 3}
            disabled={busy || !loaded}
            onClick={() => {
              setStep(0);
              setError("");
            }}
          >
            Configurar
          </button>
          <span className={`px-3 py-2 ${step === 3 ? "text-primary" : "text-muted-foreground"}`}>
            Revisar e iniciar
          </span>
        </div>
        {unsupported && (
          <p role="alert" className="rounded border border-warning p-3 text-sm text-warning">
            {INCOMPATIBLE_BNB}
          </p>
        )}
        {loaded && !unsupported && !compatible && !market.isPending && (
          <div role="alert" className="rounded border border-warning p-3 text-sm text-warning">
            <p>
              {market.isError || market.data?.error
                ? "Não foi possível confirmar o mercado desta moeda."
                : "Esta moeda não tem um par BNB compatível com o robô."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={market.isFetching}
                onClick={() => void market.refetch()}
              >
                Consultar mercado novamente
              </Button>
              <Button variant="outline" onClick={() => goToField("token")}>
                Escolher outra moeda
              </Button>
            </div>
          </div>
        )}
        {error && !loaded && (
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            Tentar carregar regras novamente
          </Button>
        )}
        {error && (
          <p
            role="alert"
            className="rounded border border-destructive p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {!loaded ? (
          <p>Carregando as regras existentes…</p>
        ) : locked && !onSelectToken ? (
          <p role="alert">
            Este robô está ligado ou tem posição aberta. Pause para revisar; regras de posições
            abertas ficam preservadas até o encerramento. Nenhuma regra foi alterada.
          </p>
        ) : (
          <>
            {locked && (
              <p role="alert" className="text-sm text-warning">
                Este robô está ligado ou tem posição aberta. Pause e aguarde encerrar a posição para
                substituir as regras; ou escolha outra moeda para criar outro robô.
              </p>
            )}
            {step < 3 && (
              <div data-setup-field="token" tabIndex={-1} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {walletOptions && onSelectWallet && (
                    <WalletPicker
                      options={walletOptions.map((w) => ({ ...w, bot: true }))}
                      value={walletScope}
                      onChange={onSelectWallet}
                      disabled={busy}
                      label="Carteira do robô"
                      manage={false}
                    />
                  )}
                  {tokens && onSelectToken && (
                    <TokenPicker
                      tokens={tokens}
                      value={token}
                      onChange={onSelectToken}
                      label="Moeda que quero comprar"
                      disabled={busy}
                    />
                  )}
                </div>
                <SetupChart
                  pool={market.data?.pools.find((p) => p.supported)?.pairAddress}
                  token={token}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Modelo de operação</h3>
                  <Button
                    variant="outline"
                    disabled={busy || locked}
                    onClick={() => setGuideOpen(true)}
                  >
                    Revisar comigo
                  </Button>
                </div>
                {(
                  [
                    [
                      "dca",
                      "Comprar em quedas",
                      "Espera a queda definida, compra uma parte e só compra novamente depois de nova queda. Vende a posição pela meta sobre o preço médio.",
                    ],
                    [
                      "grid",
                      "Comprar e vender numa faixa",
                      "Compra ao descer um nível e vende ao subir. A faixa usa BNB por moeda; os custos precisam caber no espaçamento.",
                    ],
                    [
                      "trend",
                      "Recuo em tendência de alta",
                      "Espera média rápida acima da lenta e recuo até a média lenta, com velas fechadas e rearme de sinal. Pode falhar em mudanças de tendência.",
                    ],
                    [
                      "recovery",
                      "Esperar recuperação confirmada",
                      "Modelo próprio: espera uma queda e fechamentos em alta. Não identifica nem garante o fundo.",
                    ],
                  ] as [GuidedModel, string, string][]
                ).map(([id, name, desc]) => (
                  <label
                    key={id}
                    className={`flex cursor-pointer gap-3 rounded-xl p-3 ${form.model === id ? "bg-primary/10 text-primary" : "bg-secondary"}`}
                  >
                    <input
                      type="radio"
                      name="guided-model"
                      value={id}
                      checked={form.model === id}
                      onChange={() => set("model", id)}
                      onClick={() => setGuideOpen(true)}
                    />
                    <span>
                      <b className="block text-sm">{name}</b>
                      {form.model === id && (
                        <span className="text-xs text-muted-foreground">{desc}</span>
                      )}
                    </span>
                  </label>
                ))}
                <p className="text-sm">
                  {market.isFetching
                    ? "Verificando o par de negociação…"
                    : compatible && !unsupported
                      ? "Moeda com cotação em par BNB compatível."
                      : unsupported
                        ? "Escolha outra moeda no painel para configurar."
                        : "Não foi encontrada uma cotação compatível para executar este robô."}
                </p>
                {!compatible && (
                  <Button variant="outline" onClick={() => void market.refetch()}>
                    Verificar moeda novamente
                  </Button>
                )}
              </div>
            )}
            {step < 3 && (
              <div className="space-y-4">
                <div
                  className="rounded-lg border border-primary/40 p-3 text-sm space-y-2"
                  aria-label="Saldo para configurar o robô"
                >
                  <b>Saldo disponível para este robô</b>
                  {capital.data?.report && !capital.isError ? (
                    (() => {
                      const report = capital.data.report;
                      const available = Math.max(0, Number(report.free) - form.reserve);
                      return (
                        <>
                          <details className="setup-hint">
                            <summary>Ver divisão do saldo</summary>{" "}
                            <p>Saldo na carteira: {quote(Number(report.balance))}</p>
                            <p>Em posições (custo registrado): {quote(Number(report.invested))}</p>
                            <p>
                              Reservado para compras de robôs ligados:{" "}
                              {quote(Number(report.reserved))}
                            </p>
                            <p>Reservas para taxas de robôs ligados: {quote(Number(report.gas))}</p>
                            <p>Reserva para taxas desta configuração: {quote(form.reserve)}</p>
                          </details>{" "}
                          <p className="font-semibold text-primary">
                            {capital.data.locked
                              ? "Novas compras bloqueadas: há execução pendente de conferência."
                              : `Livre para configurar: ${quote(available)}`}
                          </p>
                          {!capital.data.locked && form.capital > available && (
                            <p className="text-warning">
                              O capital informado supera o saldo livre. Reduza o valor ou adicione
                              saldo.
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Atualizado às {new Date(report.at).toLocaleTimeString("pt-BR")}. O saldo
                            é conferido novamente antes de iniciar e comprar. Configurar não reserva
                            dinheiro.
                          </p>
                        </>
                      );
                    })()
                  ) : (
                    <p>
                      {capital.isPending
                        ? "Consultando saldo disponível…"
                        : capital.isError
                          ? "Não foi possível confirmar o saldo disponível. Tente atualizar."
                          : "Carteira automática ainda não criada. Crie e adicione saldo abaixo."}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={capital.isFetching}
                    onClick={() => void capital.refetch()}
                  >
                    Atualizar saldo
                  </Button>
                </div>
                <h3 className="font-semibold">Investimento</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={currency === "BNB" ? "default" : "outline"}
                    onClick={() => setCurrency("BNB")}
                  >
                    BNB
                  </Button>
                  <Button
                    size="sm"
                    disabled={!rate}
                    variant={currency === "BRL" ? "default" : "outline"}
                    onClick={() => setCurrency("BRL")}
                  >
                    {displayCurrency === "BRL"
                      ? "Reais"
                      : displayCurrency === "USD"
                        ? "Dólares"
                        : "Euros"}{" "}
                    · estimativa
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    field="capital"
                    label={`Capital máximo (${currency === "BRL" ? fiatUnit : "BNB"})`}
                    value={amount(form.capital)}
                    onChange={(n) => set("capital", fromInput(n))}
                  />
                  <NumberField
                    field="buyAmount"
                    label={`Valor de cada compra (${currency === "BRL" ? fiatUnit : "BNB"})`}
                    value={amount(form.buyAmount)}
                    onChange={(n) => set("buyAmount", fromInput(n))}
                  />
                  {form.model !== "grid" && form.model !== "recovery" && (
                    <NumberField
                      field="maxEntries"
                      label="Máximo de compras antes de vender"
                      value={form.maxEntries}
                      onChange={(n) => set("maxEntries", n)}
                    />
                  )}
                  <NumberField
                    field="reserve"
                    label="Reserva para taxas (BNB)"
                    value={form.reserve}
                    onChange={(n) => set("reserve", n)}
                    hint="Reserva de saldo; não é uma taxa cobrada por transação."
                  />
                </div>
                <p className="text-sm">
                  Capital: {quote(form.capital)}. Compra: {quote(form.buyAmount)}.
                </p>
                <div data-setup-field="wallet" tabIndex={-1} className="rounded border p-3 text-sm">
                  <b>Carteira automática</b>
                  <p className="mt-1 break-all">{wallet?.address ?? "Ainda não criada."}</p>
                  {!wallet?.address ? (
                    <Button className="mt-2" disabled={busy || unsupported} onClick={createWallet}>
                      Criar carteira do robô
                    </Button>
                  ) : (
                    <div className="mt-2">
                      <p>Saldo atual: {wallet.bnb ?? "consultando"} BNB</p>
                      <FundBotDialog
                        sourceAddress={sourceAddress}
                        botAddress={wallet.address}
                        botBnb={wallet.bnb == null ? null : Number(wallet.bnb)}
                        need={{
                          reserve: form.reserve,
                          trade: form.buyAmount,
                          total: form.reserve + form.buyAmount,
                        }}
                        onDone={onDone}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            {step < 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Compra, venda e proteção</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {form.model === "grid" ? (
                    <>
                      <p className="text-sm sm:col-span-2">
                        Referência atual:{" "}
                        {market.data?.pools.find((p) => p.supported)?.priceNative ?? "indisponível"}{" "}
                        BNB por {symbol} (US${" "}
                        {market.data?.pools.find((p) => p.supported)?.priceUsd ?? "—"}). A faixa é
                        fixa em BNB; o equivalente em dólares varia com o BNB.
                      </p>
                      <NumberField
                        field="lower"
                        label="Preço mínimo (BNB por moeda)"
                        value={form.lower}
                        onChange={(n) => set("lower", n)}
                      />
                      <NumberField
                        field="upper"
                        label="Preço máximo (BNB por moeda)"
                        value={form.upper}
                        onChange={(n) => set("upper", n)}
                      />
                      <NumberField
                        field="levels"
                        label="Quantidade de intervalos"
                        value={form.levels}
                        onChange={(n) => set("levels", n)}
                      />
                    </>
                  ) : form.model === "trend" ? (
                    <>
                      <NumberField
                        field="maFast"
                        label="Média rápida (velas de 15 min)"
                        value={form.maFast ?? 9}
                        onChange={(n) => set("maFast", n)}
                      />
                      <NumberField
                        field="maSlow"
                        label="Média lenta (velas de 15 min)"
                        value={form.maSlow ?? 21}
                        onChange={(n) => set("maSlow", n)}
                      />
                    </>
                  ) : (
                    <NumberField
                      field="dropPct"
                      label={
                        form.model === "recovery"
                          ? "Queda mínima antes de recuperar (%)"
                          : "Comprar após queda de (%)"
                      }
                      value={form.dropPct}
                      onChange={(n) => set("dropPct", n)}
                      hint="Referência: topo de fechamentos suavizados das últimas 24h. Após comprar, novas entradas exigem queda também em relação à última compra."
                    />
                  )}
                  <NumberField
                    field="profitPct"
                    label="Meta de ganho após taxas da moeda (%)"
                    value={form.profitPct}
                    onChange={(n) => set("profitPct", n)}
                    hint={
                      form.model === "recovery"
                        ? "A saída adaptativa usa a meta conforme o mercado, respeitando este mínimo. Não inclui gás e execução."
                        : "Venda total sobre o preço médio. Gás, taxas da DEX e execução podem reduzir o ganho."
                    }
                  />
                  <NumberField
                    field="stopPct"
                    label="Vender para proteger após queda de (%)"
                    value={form.stopPct}
                    onChange={(n) => {
                      set("stopPct", n);
                      set("allowNoStop", n === 0);
                    }}
                    hint="Zero desativa este stop mediante sua escolha explícita. Não garante recuperação e pode manter uma posição em queda até perda total. Outras saídas continuam."
                  />
                  {form.model === "recovery" && (
                    <>
                      <NumberField
                        field="reboundPct"
                        label="Recuperação mínima da queda (%)"
                        value={form.reboundPct}
                        onChange={(n) => set("reboundPct", n)}
                      />
                      <NumberField
                        field="maxReboundPct"
                        label="Recuperação máxima permitida (%)"
                        value={form.maxReboundPct}
                        onChange={(n) => set("maxReboundPct", n)}
                      />
                      <NumberField
                        field="confirmationBars"
                        label="Fechamentos em alta para confirmar"
                        value={form.confirmationBars}
                        onChange={(n) => set("confirmationBars", n)}
                      />
                    </>
                  )}
                </div>
                {form.model === "dca" &&
                  form.maxEntries > 1 &&
                  form.stopPct > 0 &&
                  form.stopPct <= form.dropPct && (
                    <p role="status" className="rounded-xl bg-secondary p-3 text-sm">
                      Com o preço médio igual ao da primeira compra, este stop pode vender antes da
                      próxima recompra ou no mesmo ponto. Saídas têm prioridade sobre compras.
                      Confira os dois limites.
                    </p>
                  )}
                {form.stopPct === 0 && (
                  <p className="rounded-xl bg-secondary p-3 text-sm">
                    Stop fixo desativado. Manter tokens não garante recuperação; eles podem perder
                    todo o valor. As outras saídas configuradas continuam.
                  </p>
                )}
                <details className="rounded border p-3">
                  <summary className="cursor-pointer text-sm">
                    Taxas da moeda · confirmação necessária
                  </summary>
                  <p className="my-2 text-xs">
                    Confira as taxas cobradas pelo token. Informar zero não comprova que a moeda não
                    cobra taxas.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField
                      field="buyTax"
                      label="Taxa na compra (%)"
                      value={form.buyTax}
                      onChange={(n) => set("buyTax", n)}
                    />
                    <NumberField
                      field="sellTax"
                      label="Taxa na venda (%)"
                      value={form.sellTax}
                      onChange={(n) => set("sellTax", n)}
                    />
                  </div>
                </details>
                <details className="rounded border p-3 text-sm">
                  <summary className="cursor-pointer">Segurança do mercado e da rede</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <NumberField
                      field="minLiquidityUsd"
                      label="Liquidez mínima do par (US$)"
                      value={form.minLiquidityUsd ?? 5000}
                      onChange={(n) => set("minLiquidityUsd", n)}
                      hint="É o dinheiro disponível no par de negociação, não o saldo da carteira. Reduzir este limite aumenta o risco de impacto e dificuldade para vender. Não é reduzido automaticamente."
                    />
                    <NumberField
                      field="maxGasGwei"
                      label="Limite da taxa de rede (Gwei)"
                      value={form.maxGasGwei ?? 5}
                      onChange={(n) => set("maxGasGwei", n)}
                      hint="Teto do preço do gás; é diferente da reserva de BNB para taxas. Aumentar permite custos maiores."
                    />
                  </div>
                </details>
                <details className="rounded border p-3 text-sm">
                  <summary className="cursor-pointer">Intervalo e limite diário</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <NumberField
                      field="cooldownMin"
                      label="Intervalo mínimo entre compras (min)"
                      value={form.cooldownMin}
                      onChange={(n) => set("cooldownMin", n)}
                    />
                    <NumberField
                      field="maxTradesPerDay"
                      label="Limite de operações para novas compras"
                      value={form.maxTradesPerDay}
                      onChange={(n) => set("maxTradesPerDay", n)}
                      hint="Ao atingir este número de compras e vendas no dia, novas compras param. Saídas da posição continuam sendo avaliadas."
                    />
                  </div>
                </details>
                <p className="text-sm">
                  Taxas informadas: compra {form.buyTax}% · venda {form.sellTax}%.
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const r = await getTokenTax({ data: { address: token } });
                      if (!r.tax)
                        throw new Error(
                          "Não foi possível medir as taxas. Confira os valores no contrato antes de confirmar.",
                        );
                      setForm((p) => ({
                        ...p,
                        buyTax: r.tax!.buy,
                        sellTax: r.tax!.sell,
                        taxConfirmed: false,
                      }));
                      toast.info("Taxas consultadas. Revise os valores antes de confirmar.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Consultar taxas do contrato
                </Button>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    data-setup-field="taxConfirmed"
                    checked={form.taxConfirmed}
                    onChange={(e) => set("taxConfirmed", e.target.checked)}
                  />
                  Conferi os percentuais de taxa desta moeda, incluindo quando forem zero.
                </label>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-xl bg-secondary p-4 text-sm">
                  <dl className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <dt className="text-muted-foreground">Investimento máximo</dt>
                      <dd className="font-semibold">{quote(form.capital)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Por compra</dt>
                      <dd className="font-semibold">{quote(form.buyAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Meta de ganho</dt>
                      <dd className="text-success font-semibold">{form.profitPct}%</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Stop loss</dt>
                      <dd className="text-destructive font-semibold">
                        {form.stopPct > 0 ? `${form.stopPct}%` : "Desativado · manter tokens"}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs mb-3">
                    Metas não garantem execução nem lucro após os custos.
                  </p>
                  <details className="setup-hint">
                    <summary>Ver todas as regras</summary>
                    <p>
                      <b>{symbol}</b> · carteira {walletName} · compra com BNB
                    </p>
                    <p className="mt-2">
                      Pode usar até <b>{quote(form.capital)}</b>, mais {quote(form.reserve)}{" "}
                      reservados para taxas. Cada compra usa até {quote(form.buyAmount)},
                      respeitando o capital disponível.
                    </p>
                    <p className="mt-2">
                      {form.model === "grid"
                        ? `Faixa de ${form.lower} a ${form.upper} BNB por moeda, em ${form.levels} intervalos. A primeira avaliação apenas registra o nível; nenhuma compra imediata é prometida.`
                        : form.model === "trend"
                          ? `Média de ${form.maFast} velas acima da de ${form.maSlow}, preço recuando até a média lenta e novo sinal após rearme. Até ${form.maxEntries} entradas, sujeitas aos limites.`
                          : form.model === "recovery"
                            ? `Espera queda de ${form.dropPct}%, recuperação entre ${form.reboundPct}% e ${form.maxReboundPct}% e ${form.confirmationBars} fechamentos em alta. Apenas uma entrada por fundo.`
                            : `Primeira compra após queda de ${form.dropPct}% da referência de 24h. Até ${form.maxEntries} compras; novas entradas exigem mais queda. Não compra imediatamente ao iniciar.`}
                    </p>
                    <p className="mt-2">
                      Meta de ganho: {form.profitPct}% após taxas do token, antes dos demais custos.
                      {form.stopPct > 0
                        ? ` Stop: tentar vender após queda de ${form.stopPct}% do preço médio.`
                        : " Stop fixo desativado por escolha do usuário. Os tokens podem não recuperar o valor e podem perder todo o valor."}{" "}
                      Pausar não vende a posição.
                    </p>
                    <p className="mt-2 text-xs">
                      As regras guiadas usam velas de 15 minutos e janela de 24 horas. Esperam{" "}
                      {form.cooldownMin} minutos entre compras; novas entradas param após{" "}
                      {form.maxTradesPerDay} operações no dia, preservando as saídas da posição. Ao
                      salvar, substituem as regras anteriores deste robô pausado e sem posição,
                      incluindo parâmetros avançados. O histórico permanece.
                    </p>
                  </details>
                </div>
                {!saved ? (
                  <>
                    <p className="text-sm text-warning">
                      {issue || "Regras prontas para salvar. Isso ainda não inicia operações."}
                    </p>
                    {!validation.success && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          goToField(String(validation.error.issues[0]?.path[0] ?? "profitPct"))
                        }
                      >
                        Ir ao campo com problema
                      </Button>
                    )}
                    <Button
                      className="w-full"
                      disabled={busy || conflict || !validation.success || unsupported}
                      onClick={() => setAskStop(true)}
                    >
                      {busy ? "Salvando…" : "Salvar regras e preparar robô"}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Regras salvas. Confira as verificações abaixo para iniciar, ou conclua
                      mantendo o robô pausado.
                    </p>
                    <BotReadiness
                      userId={userId}
                      walletScope={walletScope}
                      token={token}
                      onConfigure={resolveProblem}
                    />
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                      Revisei as regras e autorizo este robô a comprar e vender automaticamente com
                      dinheiro real.
                    </label>
                    <Button
                      className="w-full"
                      disabled={
                        busy ||
                        !ack ||
                        readiness.isFetching ||
                        readiness.isError ||
                        !readiness.data?.ready
                      }
                      onClick={start}
                    >
                      {busy ? "Conferindo e iniciando…" : "Confirmar e iniciar robô"}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={busy}
                      onClick={() => onOpenChange(false)}
                    >
                      Concluir e acompanhar · manter pausado
                    </Button>
                  </>
                )}
              </div>
            )}
            {!saved && (
              <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
                {step === 3 ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={busy}
                    onClick={() => setStep(0)}
                  >
                    Editar parâmetros
                  </Button>
                ) : (
                  <Button
                    className="h-12 w-full"
                    disabled={busy || unsupported || locked || !compatible}
                    onClick={() => {
                      if (!validation.success) {
                        const problem = validation.error.issues[0];
                        goToField(String(problem?.path[0] ?? "profitPct"));
                        setError(
                          problem?.path[0] === "taxConfirmed"
                            ? "Confirme as taxas da moeda antes de continuar."
                            : issue,
                        );
                        return;
                      }
                      setError("");
                      setStep(3);
                    }}
                  >
                    Revisar robô
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        <Button variant="ghost" onClick={() => close(false)}>
          Fechar e continuar depois
        </Button>
      </DialogContent>
    </Dialog>
  );
}
