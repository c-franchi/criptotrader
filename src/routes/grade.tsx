import { ExecutionTimingPanel } from "@/components/ExecutionTimingPanel";
import { BotWithdrawalPanel, BotWithdrawalHistory } from "@/components/BotWithdrawalPanel";
import { botSearch } from "@/lib/botNotice";
import { inspectToken } from "@/lib/userTokens.functions";
import { ReconcileSaleButton } from "@/components/ReconcileSaleButton";
import { useRobotChartOrders } from "@/hooks/useRobotChartOrders";
import { TradingTour } from "@/components/TradingTour";
import { FinishAutomationButton } from "@/components/FinishAutomationButton";
import type { ReadinessAction } from "@/lib/readinessIssues";
import { FiatValue } from "@/hooks/useCurrency";
import { TokenPicker } from "@/components/TokenPicker";
import { formatUsd } from "@/lib/display";
import { GuidedBotSetup } from "@/components/GuidedBotSetup";
import { BotReadiness } from "@/components/BotReadiness";
import { BotPerformancePanel } from "@/components/BotPerformancePanel";
import { startGuidedBot } from "@/lib/guidedBot.functions";
import { incompatibleBotToken, INCOMPATIBLE_BNB } from "@/lib/guidedBot";
import { recoverStrategyExecution } from "@/lib/strategy.functions";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin, Unavailable } from "@/components/AppShell";
import {
  getExecutionStatus,
  getBotAnalysis,
  createBotWallet,
  getBotWallet,
  runGridNow,
} from "@/lib/bot.functions";
import { AddTokenDialog } from "@/components/AddTokenDialog";
import { ChevronDown } from "lucide-react";
import { WalletCapitalPanel } from "@/components/WalletCapitalPanel";
import { RemoveBotButton } from "@/components/RemoveBotButton";
import { ResetStrategiesButton } from "@/components/ResetStrategiesButton";
import { formatEther, formatUnits } from "viem";
import { HelpTip } from "@/components/HelpTip";
import { RobotVision } from "@/components/RobotVision";
import { FundBotDialog } from "@/components/FundBotDialog";
import { requiredBotBnb } from "@/lib/botFunding";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_CONFIG, describeStrategy, type StrategyConfig } from "@/lib/strategy";
import { PRESETS } from "@/lib/presets";
import { normalizeState } from "@/lib/autoStrategy";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/grade")({
  validateSearch: botSearch,
  head: () => ({
    meta: [
      { title: "Robô automático — CryptoBot" },
      {
        name: "description",
        content:
          "Robô que compra e vende sozinho na PancakeSwap seguindo a estratégia que você salvou, com carteira própria.",
      },
      { property: "og:title", content: "Robô automático — CryptoBot" },
      {
        property: "og:description",
        content:
          "Robô que segue sua estratégia salva, com carteira dedicada e botão de ligar e desligar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequireLogin>
        <Robo />
      </RequireLogin>
    </AppShell>
  ),
});

type Bot = Tables<"grid_bots">;
type Wallet = Awaited<ReturnType<typeof getBotWallet>>;
type Mode = "estrategia" | "grade";
const blank = {
  lower_price: "",
  upper_price: "",
  levels: "10",
  order_bnb: "0.01",
  max_slippage_pct: "3",
  max_impact_pct: "3",
  gas_reserve_bnb: "0.005",
};

function Robo() {
  const { user } = useAuth();
  const {
    walletScope,
    address: sourceAddress,
    name: walletName,
    wallets: scopeWallets,
    selectWallet,
    ready: walletReady,
  } = useSelectedWallet();
  const getW = useServerFn(getBotWallet),
    createW = useServerFn(createBotWallet),
    runNow = useServerFn(runGridNow);
  const {
    token: selected,
    selectToken: setToken,
    selectInspectedToken,
    tokens,
  } = useSelectedToken();
  const target = Route.useSearch();
  const navigateTarget = Route.useNavigate();
  const chooseToken = (address: string) => {
    setTargetError("");
    setToken(address);
    void navigateTarget({ search: { token: address, carteira: walletScope } });
  };
  const [targetError, setTargetError] = useState("");
  useEffect(() => {
    if (
      walletReady &&
      target.carteira &&
      target.carteira !== walletScope &&
      !selectWallet(target.carteira)
    )
      setTargetError("Esta carteira não está disponível na sua conta.");
  }, [target.carteira, walletScope, walletReady, selectWallet]);
  useEffect(() => {
    if (!target.token || target.token.toLowerCase() === selected.address.toLowerCase()) return;
    let alive = true;
    void inspectToken({ data: { address: target.token } })
      .then((r) => {
        if (!alive) return;
        if (r.token) selectInspectedToken(r.token);
        else setTargetError(r.error ?? "Moeda indisponível");
      })
      .catch(() => {
        if (alive) setTargetError("Não foi possível carregar a moeda deste robô.");
      });
    return () => {
      alive = false;
    };
  }, [target.token, selected.address, selectInspectedToken]);
  const token = selected.address;
  const sym = selected.symbol;
  const chartOrders = useRobotChartOrders(user?.id, walletScope, token);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartFocus, setChartFocus] = useState<{ id: string; request: number } | null>(null);
  useEffect(() => {
    setChartFocus(null);
  }, [walletScope, token]);
  const locateOrder = (id: string) => {
    setChartFocus((previous) => ({ id, request: (previous?.request ?? 0) + 1 }));
    requestAnimationFrame(() =>
      chartRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  };
  const [w, setW] = useState<Wallet | null>(null);
  const [bot, setBot] = useState<Bot | null>(null);
  const [mode, setMode] = useState<Mode>("estrategia");
  const [cfg, setCfg] = useState<StrategyConfig | null | undefined>(undefined);
  const [f, setF] = useState(blank);
  const [orderLimit, setOrderLimit] = useState(20);
  const [orders, setOrders] = useState<Tables<"orders">[]>([]);
  const plotOrders = useMemo(
    () => [
      ...new Map(
        [...(chartOrders.data ?? []), ...orders.filter((o) => o.status === "confirmada")].map(
          (o) => [o.id, o],
        ),
      ).values(),
    ],
    [chartOrders.data, orders],
  );
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof getBotAnalysis>> | null>(null);
  const [analysisError, setAnalysisError] = useState(false);
  useEffect(() => {
    let alive = true;
    let busy = false;
    setAnalysis(null);
    setAnalysisError(false);
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await getBotAnalysis({ data: { token, walletScope } });
        if (alive) {
          setAnalysis(result);
          setAnalysisError(false);
        }
      } catch {
        if (alive) setAnalysisError(true);
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [token, walletScope]);
  const [execution, setExecution] = useState<Awaited<ReturnType<typeof getExecutionStatus>> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<"bots" | "assets" | "orders">("bots");
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupProblem, setSetupProblem] = useState<ReadinessAction | undefined>();
  const showExecutionProblem = useCallback(() => {
    setSetupOpen(false);
    setSetupProblem(undefined);
    setTimeout(() => {
      const button = document.getElementById("robot-execution-recovery");
      for (let parent = button?.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === "DETAILS") (parent as HTMLDetailsElement).open = true;
      }
      button?.scrollIntoView({ block: "center", behavior: "smooth" });
      button?.focus();
    }, 0);
  }, []);
  const selectionKey = `${walletScope}:${token}`;
  const selectionRef = useRef(selectionKey);
  selectionRef.current = selectionKey;
  useEffect(() => {
    if (!fullscreen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", escape);
    };
  }, [fullscreen]);
  const [allBots, setAllBots] = useState<Bot[]>([]);

  const loadingKeys = useRef(new Set<string>());
  const load = useCallback(async () => {
    const key = `${walletScope}:${token}`;
    if (loadingKeys.current.has(key)) return;
    loadingKeys.current.add(key);
    try {
      const walletRefresh = Promise.allSettled([
        getExecutionStatus({ data: { walletScope } })
          .then((value) => {
            if (selectionRef.current === key) setExecution(value);
          })
          .catch(() => {
            if (selectionRef.current === key) setExecution(null);
          }),
        getW({ data: { walletScope } })
          .then((value) => {
            if (selectionRef.current === key) setW(value);
          })
          .catch(() => {
            if (selectionRef.current === key) setW({ address: null, bnb: null, tokens: [] });
          }),
      ]);
      const { data: list } = await supabase
        .from("grid_bots")
        .select("*")
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (selectionRef.current !== key) return;
      setAllBots(list ?? []);
      const data =
        (list ?? []).find(
          (b) => b.wallet_scope === walletScope && b.token.toLowerCase() === token.toLowerCase(),
        ) ?? null;
      setBot(data);
      setMode((data?.mode as Mode) ?? "estrategia");
      setF(
        data && data.mode === "grade"
          ? (Object.fromEntries(
              Object.keys(blank).map((k) => [k, String((data as Record<string, unknown>)[k])]),
            ) as typeof blank)
          : blank,
      );
      const { data: s } = await supabase
        .from("strategies")
        .select("config")
        .eq("wallet_scope", walletScope)
        .ilike("token", token)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (selectionRef.current !== key) return;
      setCfg(s ? { ...EMPTY_CONFIG, ...(s.config as Partial<StrategyConfig>) } : null);
      const { data: o } = await supabase
        .from("orders")
        .select("*")
        .eq("wallet_scope", walletScope)
        .in("source", ["grade", "robo"])
        .ilike("token", token)
        .order("created_at", { ascending: false })
        .limit(orderLimit);
      if (selectionRef.current !== key) return;
      setOrders(o ?? []);
      await walletRefresh;
    } finally {
      loadingKeys.current.delete(key);
    }
  }, [token, getW, orderLimit, walletScope]);
  useEffect(() => {
    setW(null);
    setBot(null);
    setCfg(undefined);
    setExecution(null);
    setOrders([]);
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [load]);

  const persist = async (armed?: boolean) => {
    if (!user || !walletReady) return;
    if (armed) {
      try {
        await startGuidedBot({ data: { walletScope, token, confirmation: "INICIAR ROBÔ" } });
        toast.success("Robô iniciado após conferir moeda, mercado, saldo e custos.");
        await load();
      } catch (e) {
        toast.error((e as Error).message);
      }
      return;
    }
    let row: Record<string, unknown> = {
      user_id: user.id,
      archived_at: null,
      wallet_scope: walletScope,
      token,
      mode,
      armed: armed ?? bot?.armed ?? false,
      updated_at: new Date().toISOString(),
    };
    if (mode === "grade") {
      const lo = Number(f.lower_price),
        hi = Number(f.upper_price),
        lv = Number(f.levels),
        ob = Number(f.order_bnb);
      if (!(hi > lo && lo > 0))
        return void toast.error("Preço máximo precisa ser maior que o mínimo");
      if (!(lv >= 2 && lv <= 100) || !(ob > 0))
        return void toast.error("Revise faixas e valor por ordem");
      row = {
        ...row,
        lower_price: lo,
        upper_price: hi,
        levels: lv,
        order_bnb: ob,
        max_slippage_pct: Number(f.max_slippage_pct),
        max_impact_pct: Number(f.max_impact_pct),
        gas_reserve_bnb: Number(f.gas_reserve_bnb),
      };
    }
    // Desligar nunca pode ser bloqueado: atualiza só o campo "armed" (upsert dispara a trava de configuração).
    const { error } =
      armed === false && bot
        ? await supabase
            .from("grid_bots")
            .update({ armed: false, updated_at: new Date().toISOString() })
            .eq("id", bot.id)
        : await supabase
            .from("grid_bots")
            .upsert(row as never, { onConflict: "user_id,wallet_scope,token" });
    if (error)
      return void toast.error(
        armed === false
          ? `Não foi possível desligar: ${error.message}`
          : /Wallet execution pending|Execução em andamento|execution.*lock/i.test(error.message)
            ? "A carteira está conferindo uma operação anterior. Atualize o estado antes de tentar novamente."
            : `Não foi possível salvar: ${error.message}`,
      );
    await supabase.from("audit_log").insert({
      user_id: user.id,
      action: armed === undefined ? "bot_saved" : armed ? "bot_armed" : "bot_disarmed",
      details: row as never,
    });
    toast.success(
      armed === undefined ? "Configuração salva" : armed ? "Robô LIGADO" : "Robô desligado",
    );
    load();
  };

  const save = async (armed?: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await persist(armed);
    } finally {
      setSaving(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      load();
    }
  };

  const bnb = w?.bnb != null ? Number(w.bnb) : null;
  const reserve = mode === "estrategia" ? (cfg?.gasReserveBnb ?? 0.005) : Number(f.gas_reserve_bnb);
  const need =
    mode === "estrategia"
      ? cfg
        ? requiredBotBnb({ reserve, sizingMode: cfg.sizingMode, buyAmount: cfg.buyAmount })
        : null
      : { reserve, trade: Number(f.order_bnb) || 0, total: reserve + (Number(f.order_bnb) || 0) };
  const st = normalizeState(bot?.strat_state, Date.now());
  const preset = cfg?.presetId ? PRESETS.find((p) => p.id === cfg.presetId) : undefined;
  const modelName =
    cfg?.guidedModel === "dca"
      ? "Comprar em quedas"
      : cfg?.guidedModel === "grid"
        ? "Comprar e vender numa faixa"
        : cfg?.guidedModel === "recovery"
          ? "Recuperação confirmada"
          : cfg?.guidedModel === "trend"
            ? "Recuo em tendência de alta"
            : (preset?.name ?? "Regras personalizadas");
  const armed = !!bot?.armed;
  const lo = Number(f.lower_price),
    hi = Number(f.upper_price),
    lv = Number(f.levels);
  const lines =
    hi > lo && lv >= 2 && lv <= 100
      ? Array.from({ length: lv + 1 }, (_, i) => lo + (i * (hi - lo)) / lv)
      : [];

  const targetApplied = useRef("");
  useEffect(() => {
    const key = `${target.bot}:${target.problema}:${target.token}:${target.carteira}`;
    if (
      !bot ||
      targetApplied.current === key ||
      (target.token && target.token.toLowerCase() !== token.toLowerCase()) ||
      (target.carteira && target.carteira !== walletScope)
    )
      return;
    targetApplied.current = key;
    if (target.problema === "history") setWorkspaceTab("orders");
    else if (target.problema === "execution") showExecutionProblem();
    else if (target.problema) {
      document
        .getElementById("robot-current-problem")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [
    bot,
    showExecutionProblem,
    target.bot,
    target.problema,
    target.token,
    target.carteira,
    walletScope,
    token,
  ]);
  if (targetError)
    return (
      <div role="alert" className="p-4">
        <p>{targetError}</p>
        <a className="text-primary underline" href="/grade">
          Voltar aos meus robôs
        </a>
      </div>
    );
  if (
    (target.carteira && walletScope !== target.carteira) ||
    (target.token && token.toLowerCase() !== target.token.toLowerCase())
  )
    return <p role="status">Abrindo a carteira e a moeda deste robô…</p>;
  if (fullscreen)
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gráfico do robô em tela cheia"
        className="exchange-workspace fixed inset-0 z-50 overflow-y-auto bg-background p-3 sm:p-5"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-semibold">{sym} · gráfico e níveis salvos</p>
          <Button variant="outline" onClick={() => setFullscreen(false)}>
            Sair da tela cheia
          </Button>
        </div>
        <RobotVision
          chartOnly
          key={selectionKey}
          focusRequest={chartFocus}
          tokenDecimals={selected.decimals}
          token={token}
          symbol={sym}
          cfg={cfg}
          state={st}
          mode={mode}
          grid={lines}
          orders={plotOrders}
          armed={armed}
          reason={bot?.last_reason}
          evaluatedAt={bot?.last_run_at}
          executionBlocked={execution?.locked}
          serverAnalysis={analysis}
        />
      </div>
    );
  return (
    <div className="exchange-workspace space-y-4">
      <div className="mx-auto w-full max-w-[1700px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Bots à vista</h1>
            <p className="text-sm text-muted-foreground">
              {sym} / BNB · {walletName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TradingTour kind="bot" onComplete={() => setSetupOpen(true)} />
            {armed && (
              <Button variant="destructive" disabled={saving} onClick={() => save(false)}>
                Pausar robô
              </Button>
            )}
            {bot && st.tokens > 0 && user && (
              <FinishAutomationButton
                botId={bot.id}
                walletScope={walletScope}
                userId={user.id}
                armed={armed}
                symbol={sym}
                onDone={load}
              />
            )}
            <Button variant="outline" onClick={() => setFullscreen(!fullscreen)}>
              {fullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
            </Button>
            <Button
              disabled={!walletReady || busy || saving || cfg === undefined}
              onClick={() => setSetupOpen(true)}
            >
              {armed ? "Editar robô" : bot ? "Configurar e iniciar" : "Criar robô"}
            </Button>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Moeda / BNB</p>
          <div data-token-picker className="flex flex-wrap gap-2">
            <TokenPicker tokens={tokens} value={token} onChange={chooseToken} />
            <AddTokenDialog />
          </div>
        </div>

        {target.problema && (
          <section
            id="robot-current-problem"
            tabIndex={-1}
            className="my-3 rounded-xl border border-warning/30 p-3"
            role="status"
          >
            <p className="font-semibold">
              Aviso de {sym} · {walletName}
            </p>
            <p className="mt-1 text-sm">
              {!bot?.armed
                ? `Este robô está pausado. Aviso histórico: ${bot?.last_error || "consulte o histórico de operações."}`
                : bot?.last_error ||
                  "O problema pode ter sido resolvido desde o aviso. Confira a avaliação atual."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                if (target.problema === "execution") showExecutionProblem();
                else {
                  setSetupProblem(
                    target.problema === "market"
                      ? "token"
                      : target.problema === "fund"
                        ? "fund"
                        : target.problema === "fees"
                          ? "fees"
                          : "rules",
                  );
                  setSetupOpen(true);
                }
              }}
            >
              Ir à correção deste problema
            </Button>
          </section>
        )}
        <ExecutionTimingPanel
          key={`timing:${selectionKey}`}
          walletScope={walletScope}
          token={token}
        />
        <GuidedBotSetup
          sourceAddress={sourceAddress}
          key={`setup:${selectionKey}`}
          userId={user?.id ?? ""}
          open={setupOpen}
          onOpenChange={(value) => {
            setSetupOpen(value);
            if (!value) setSetupProblem(undefined);
          }}
          problemTarget={setupProblem}
          onExecutionIssue={showExecutionProblem}
          walletScope={walletScope}
          walletName={walletName}
          token={token}
          symbol={sym}
          wallet={w}
          onDone={load}
          tokens={tokens}
          onSelectToken={chooseToken}
          walletOptions={[
            { id: LEGACY_WALLET_SCOPE, label: "Robô original" },
            ...scopeWallets.map((w) => ({ id: w.id, label: w.label || w.address.slice(0, 10) })),
          ]}
          onSelectWallet={selectWallet}
        />
        {incompatibleBotToken(token) && (
          <p
            role="alert"
            className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning"
          >
            {INCOMPATIBLE_BNB}
          </p>
        )}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
          <Panel title="Mercado">
            <div ref={chartRef} className="mt-3 scroll-mt-24">
              {chartOrders.isError && (
                <p role="alert" className="mb-2 text-sm text-warning">
                  Não foi possível atualizar todas as marcações. Os registros já recebidos foram
                  mantidos.{" "}
                  <button
                    className="text-primary underline"
                    onClick={() => void chartOrders.refetch()}
                  >
                    Tentar novamente
                  </button>
                </p>
              )}
              <RobotVision
                streamlined
                key={selectionKey}
                focusRequest={chartFocus}
                tokenDecimals={selected.decimals}
                token={token}
                symbol={sym}
                cfg={cfg}
                state={st}
                mode={mode}
                grid={lines}
                orders={plotOrders}
                armed={armed}
                reason={bot?.last_reason}
                evaluatedAt={bot?.last_run_at}
                executionBlocked={execution?.locked}
                serverAnalysis={analysisError ? null : analysis}
              />
            </div>
          </Panel>
          <div className="space-y-4">
            <details className="border-b border-border py-3">
              <summary className="cursor-pointer text-sm font-medium">
                Estado e controles do robô
              </summary>
              <Panel title={`Robô · ${sym} · ${walletName}`}>
                <p role="status" className="text-lg font-semibold">
                  {!execution
                    ? "Consultando estado…"
                    : incompatibleBotToken(token)
                      ? "Impedido de operar · moeda incompatível"
                      : execution.locked
                        ? "Aguardando confirmação de operação"
                        : !armed
                          ? "Pausado"
                          : bot?.last_error
                            ? "Precisa de atenção"
                            : !bot?.last_run_at || Date.now() - Date.parse(bot.last_run_at) > 180000
                              ? "Aguardando o executor"
                              : "Ligado · acompanhando o mercado"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {incompatibleBotToken(token)
                    ? INCOMPATIBLE_BNB
                    : execution?.locked
                      ? "A carteira está conferindo uma operação. Você pode pausar o robô; novas operações aguardam a confirmação."
                      : !armed
                        ? "Escolha a estratégia e toque em Iniciar robô quando estiver pronto."
                        : bot?.last_error ||
                          bot?.last_reason ||
                          "O robô confere as condições de compra e venda a cada 2 segundos."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {armed ? (
                    <Button disabled={saving} variant="destructive" onClick={() => save(false)}>
                      Pausar robô
                    </Button>
                  ) : (
                    <Button
                      disabled={
                        saving ||
                        !walletReady ||
                        !execution ||
                        execution.locked ||
                        !w?.address ||
                        !cfg ||
                        !bot ||
                        incompatibleBotToken(token)
                      }
                      onClick={() =>
                        confirm(
                          `Iniciar o robô para ${sym}? Ele comprará e venderá automaticamente com dinheiro real, seguindo a configuração salva.`,
                        ) && save(true)
                      }
                    >
                      {saving ? "Salvando…" : "Iniciar robô"}
                    </Button>
                  )}
                  {bot && (
                    <RemoveBotButton
                      key={bot.id}
                      botId={bot.id}
                      walletScope={walletScope}
                      symbol={sym}
                      armed={armed}
                      onDone={() => {
                        setBot(null);
                        void load();
                      }}
                    />
                  )}
                  <Button
                    variant="outline"
                    disabled={busy || saving}
                    id="robot-execution-recovery"
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await recoverStrategyExecution({ data: { walletScope } });
                        await load();
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    {execution?.locked ? "Verificar e recuperar" : "Atualizar estado"}
                  </Button>
                  <Button variant="outline" onClick={() => setSetupOpen(true)}>
                    Editar regras aqui
                  </Button>
                </div>
                {!cfg && (
                  <p className="mt-3 rounded-md border border-warning/40 p-2 text-sm text-warning">
                    Ainda não há regras salvas para esta moeda. Toque em “Criar robô passo a passo”
                    para definir valores, compras e saídas sem sair desta tela.
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Operações com dinheiro real. Nenhuma estratégia garante lucro. Bots da mesma
                  carteira compartilham o saldo; os quadros de saldo abaixo mostram o capital
                  reservado e o livre.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Info
                    label="Saldo da carteira"
                    value={
                      bnb === null
                        ? "Consultando…"
                        : `${bnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB`
                    }
                  />
                  <Info
                    label="Modelo de regras"
                    value={
                      mode === "grade" ? "Grade de preços" : cfg ? modelName : "Não configurada"
                    }
                  />
                </div>
                <details open className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Última análise e execução</summary>
                  <div className="mt-2 space-y-2">
                    <p>
                      Última avaliação:{" "}
                      {bot?.last_run_at
                        ? new Date(bot.last_run_at).toLocaleString("pt-BR")
                        : "aguardando"}
                      .
                    </p>
                    {bot?.last_error && <p className="text-warning">{bot.last_error}</p>}
                    {execution?.lockAcquiredAt && (
                      <p>
                        Conferência iniciada em{" "}
                        {new Date(execution.lockAcquiredAt).toLocaleString("pt-BR")}.
                      </p>
                    )}
                    {execution?.pending.map((p) => (
                      <a
                        key={p.tx_hash}
                        className="block text-primary underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://bscscan.com/tx/${p.tx_hash}`}
                      >
                        Ver transação na rede
                      </a>
                    ))}
                    {st.accountingEstimated && (
                      <p>
                        A posição contém valores estimados; consulte a auditoria para os valores
                        confirmados.
                      </p>
                    )}
                  </div>
                </details>
              </Panel>
            </details>
            {!armed && bot && (
              <BotReadiness
                userId={user?.id ?? ""}
                walletScope={walletScope}
                token={token}
                onConfigure={(action) => {
                  if (action === "execution") showExecutionProblem();
                  else {
                    setSetupProblem(action ?? "rules");
                    setSetupOpen(true);
                  }
                }}
              />
            )}
            <BotPerformancePanel
              walletScope={walletScope}
              token={token}
              onUpdated={() => void load()}
            />
          </div>
        </div>
        <div className="trade-tabs" role="tablist" aria-label="Dados dos robôs">
          {(
            [
              ["bots", `Meus bots (${allBots.length})`],
              ["assets", "Ativos e saldo"],
              ["orders", `Histórico (${orders.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={workspaceTab === id}
              onClick={() => setWorkspaceTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <section hidden={workspaceTab !== "bots"} role="tabpanel" aria-label="Meus bots">
          <Panel
            title={`Meus robôs (${allBots.filter((b) => b.armed).length} ligado${allBots.filter((b) => b.armed).length === 1 ? "" : "s"})`}
          >
            <p className="mb-2 text-xs text-muted-foreground">
              Você pode ter <strong className="text-foreground">um robô para cada token</strong>, em
              cada carteira. Eles continuam ativos ao trocar a visualização. Toque em um robô para
              abrir a carteira e o token correspondentes.
            </p>
            {allBots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum robô criado ainda. Escolha um token abaixo e siga os passos.
              </p>
            ) : (
              <ul className="space-y-2">
                {allBots.map((b) => {
                  const tk = tokens.find((t) => t.address.toLowerCase() === b.token.toLowerCase());
                  const active =
                    b.wallet_scope === walletScope && b.token.toLowerCase() === token.toLowerCase();
                  const scopeName =
                    b.wallet_scope === LEGACY_WALLET_SCOPE
                      ? "Robô original"
                      : scopeWallets.find((w) => w.id === b.wallet_scope)?.label ||
                        "Outra carteira";
                  return (
                    <li key={b.id}>
                      <button
                        onClick={() => {
                          selectWallet(b.wallet_scope);
                          chooseToken(tk?.address ?? b.token);
                        }}
                        className={`w-full rounded-md border p-3 text-left text-xs ${active ? "border-primary bg-primary/10" : b.armed ? "border-success/50 bg-success/5" : "border-border"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            🤖 {tk?.symbol ?? `${b.token.slice(0, 6)}…`}
                            {active && (
                              <span className="ml-2 text-[10px] text-primary">● vendo agora</span>
                            )}
                          </span>
                          <span
                            className={
                              b.armed ? "font-medium text-success" : "text-muted-foreground"
                            }
                          >
                            {b.armed
                              ? b.last_error
                                ? "● Requer atenção"
                                : "● Ligado"
                              : "○ Pausado"}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {scopeName} ·{" "}
                          {b.mode === "grade" ? "Grade de preços" : "Minha estratégia"}
                          {b.last_run_at
                            ? ` · conferiu às ${new Date(b.last_run_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </p>
                      </button>
                      <div className="mt-2">
                        <RemoveBotButton
                          botId={b.id}
                          walletScope={b.wallet_scope}
                          symbol={tk?.symbol ?? b.token.slice(0, 8)}
                          armed={b.armed}
                          onDone={() => void load()}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>
        <section hidden={workspaceTab !== "assets"} role="tabpanel" aria-label="Ativos e saldo">
          <BotWithdrawalPanel
            key={walletScope}
            walletScope={walletScope}
            walletName={walletName}
            sourceAddress={w?.address ?? null}
            onDone={load}
          />
          <WalletCapitalPanel
            key={selectionKey}
            walletScope={walletScope}
            previewId={!armed ? bot?.id : undefined}
            locked={execution?.locked}
            tokens={tokens}
          />

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Panel title={`Posição e operações · ${sym}`}>
              <div className="space-y-2 text-sm">
                {mode === "estrategia" ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Info
                      label="Compras abertas"
                      value={`${st.entries} de ${cfg?.maxEntries ?? "—"}`}
                    />
                    <Info
                      label="Preço médio de compra"
                      value={st.avgPriceUsd > 0 ? formatUsd(st.avgPriceUsd) : "sem posição"}
                      usd={st.avgPriceUsd > 0 ? st.avgPriceUsd : undefined}
                    />
                    <Info
                      label={`${sym} comprados`}
                      value={
                        st.tokens > 0
                          ? st.tokens.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                          : "0"
                      }
                    />
                    <Info
                      label="BNB investido"
                      bnb={st.costBnb}
                      value={st.costBnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}
                    />
                    <Info
                      label="Operações hoje"
                      value={`${st.tradesToday} de ${cfg?.maxTradesPerDay ?? "—"}`}
                    />
                    <Info
                      label="Último preço visto"
                      value={bot?.last_price ? formatUsd(bot.last_price) : "—"}
                      usd={bot?.last_price ? Number(bot.last_price) : undefined}
                    />
                  </div>
                ) : (
                  <p className="text-xs">
                    Faixa atual: {bot?.last_level ?? "—"} de {bot?.levels ?? "—"}
                  </p>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer">Execução manual avançada</summary>{" "}
                  <Button
                    variant="secondary"
                    disabled={busy || !bot || !armed || execution?.locked}
                    onClick={() =>
                      confirm(
                        "Executar uma avaliação agora? Se houver um sinal válido, o robô poderá enviar uma operação real.",
                      ) &&
                      act(() => runNow({ data: { token, walletScope } }), "Avaliação executada")
                    }
                  >
                    Avaliar e operar agora
                  </Button>
                </details>
              </div>
            </Panel>
          </div>
        </section>
        <section hidden={workspaceTab !== "orders"} role="tabpanel" aria-label="Histórico do robô">
          <BotWithdrawalHistory
            key={walletScope}
            walletScope={walletScope}
            enabled={workspaceTab === "orders"}
          />
          <div>
            <Panel title={`Operações do robô (${orders.length})`}>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma operação ainda.</p>
              ) : (
                orders.map((o) => (
                  <div key={o.id} className="mb-2 rounded border border-border p-2 text-xs">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span
                        className={`rounded border px-1 font-semibold uppercase ${o.side === "compra" ? "border-success/50 text-success" : "border-destructive/50 text-destructive"}`}
                      >
                        {o.side}{" "}
                        {
                          tokens.find((t) => t.address.toLowerCase() === o.token.toLowerCase())
                            ?.symbol
                        }
                      </span>
                      <span className="font-mono">{o.status}</span>
                      <span className="text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {o.status === "confirmada" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-2 w-full"
                        aria-pressed={chartFocus?.id === o.id}
                        onClick={() => locateOrder(o.id)}
                      >
                        Ver {o.side} no gráfico ↗
                      </Button>
                    )}
                    <div className="my-2 grid grid-cols-2 gap-2">
                      <p>
                        Valor da ordem:{" "}
                        <b>
                          {rawAmount(o.amount_in, o.side === "compra" ? 18 : selected.decimals)}{" "}
                          {o.side === "compra" ? "BNB" : sym}
                        </b>
                      </p>
                      {o.side === "compra" && (
                        <p>
                          Quantidade recebida:{" "}
                          <b>
                            {o.actual_token_delta == null
                              ? "Não apurada"
                              : `${rawAmount(o.actual_token_delta, selected.decimals)} ${sym}`}
                          </b>
                        </p>
                      )}
                      <p>
                        Gás registrado:{" "}
                        <b>{o.gas_bnb == null ? "Não apurado" : `${o.gas_bnb} BNB`}</b>
                      </p>
                      {o.side === "venda" && (
                        <p>
                          BNB recebido:{" "}
                          <b>
                            {o.actual_bnb_received == null
                              ? "Recebimento pendente de apuração"
                              : `${o.actual_bnb_received} BNB`}
                          </b>
                        </p>
                      )}
                      <p>
                        Contabilidade:{" "}
                        {o.accounting_status ?? "Registro legado; conferir auditoria"}
                      </p>
                    </div>
                    {o.side === "venda" &&
                      o.status === "confirmada" &&
                      o.actual_bnb_received == null &&
                      o.tx_hash && (
                        <ReconcileSaleButton hash={o.tx_hash} onUpdated={() => void load()} />
                      )}
                    {o.tx_hash && (
                      <a
                        className="break-all font-mono text-primary underline"
                        href={`https://bscscan.com/tx/${o.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver na BscScan
                      </a>
                    )}
                    {o.error && <p className="text-destructive">{o.error}</p>}
                  </div>
                ))
              )}
            </Panel>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={orders.length < orderLimit}
            onClick={() => setOrderLimit((n) => n + 20)}
          >
            Carregar mais operações
          </Button>
        </section>
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Avançado · regras antigas, operação manual e histórico de segurança
          </summary>
          <div className="mt-4 space-y-4">
            <Panel collapsible title="Como funciona a carteira do robô (leia antes)">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md border border-border p-3">
                  <p className="font-semibold text-primary">👛 Sua carteira</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A que você já usa (MetaMask, Trust…). Continua só sua. O robô{" "}
                    <strong className="text-foreground">não tem acesso</strong> a ela.
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="font-semibold text-primary">➡️ Você envia</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Com o botão "Enviar BNB da minha carteira", você escolhe o valor e confirma no
                    seu app. Só esse valor passa para o robô.
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="font-semibold text-primary">🤖 Carteira do robô</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Uma carteira real e separada na rede BSC (dá para ver na BscScan). Ele compra e
                    vende só com o que está nela.
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>
                  🔒 A chave da carteira do robô é criada no servidor e guardada criptografada.
                  Ninguém a vê — nem você, nem a equipe.
                </li>
                <li>
                  🔒 O CryptoBot <strong className="text-foreground">nunca</strong> pede sua frase
                  secreta ou chave privada. Se alguém pedir, é golpe.
                </li>
                <li>
                  🔒 O dinheiro do robô só pode voltar para uma carteira sua salva em Minhas
                  carteiras há mais de 24 horas.
                </li>
                <li>
                  💡 Deixe no robô só um valor pequeno que aceita arriscar. Para recuperar tudo, use
                  "Devolver ativos à carteira mãe".
                </li>
              </ul>
            </Panel>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel
                collapsible
                title="Configuração do robô"
                right={
                  <HelpTip title="Qual modo escolher?">
                    <p>
                      <strong>Minha estratégia</strong> (recomendado): usa as regras que você salvou
                      em Estratégia — quando comprar, quanto, metas de lucro, stop-loss, limites por
                      dia e a taxa do token.
                    </p>
                    <p className="mt-2">
                      <strong>Grade de preços</strong> (avançado): você define um preço mínimo e
                      máximo; o robô compra um pouco a cada degrau de queda e vende a cada degrau de
                      alta.
                    </p>
                  </HelpTip>
                }
              >
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {(["estrategia", "grade"] as const).map((m) => (
                    <button
                      key={m}
                      disabled={armed}
                      onClick={() => setMode(m)}
                      className={`rounded-md border p-2 text-left text-xs disabled:opacity-60 ${mode === m ? "border-primary bg-primary/10" : "border-border"}`}
                    >
                      <span className="block font-semibold">
                        {mode === m && "✓ "}
                        {m === "estrategia" ? "Minha estratégia" : "Grade de preços"}
                      </span>
                      <span className="text-muted-foreground">
                        {m === "estrategia" ? "Recomendado" : "Avançado"}
                      </span>
                    </button>
                  ))}
                </div>
                {armed && (
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Pause o robô para trocar o modo.
                  </p>
                )}
                {mode === "estrategia" &&
                  (cfg === undefined ? (
                    <Unavailable reason="carregando" />
                  ) : cfg === null ? (
                    <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
                      Você ainda não salvou uma estratégia para {sym}.{" "}
                      <Link to="/estrategia" className="font-medium text-primary underline">
                        Criar agora ›
                      </Link>
                    </div>
                  ) : (
                    <div className="rounded-md border border-primary/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 text-sm font-semibold text-primary">
                          ✓ {modelName} · {sym}
                        </p>
                        <Link
                          to="/estrategia"
                          className="shrink-0 text-xs font-medium text-primary underline"
                        >
                          Ver ou mudar ›
                        </Link>
                      </div>
                      <details className="group mt-2">
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                          {preset
                            ? "Ver como esta estratégia funciona"
                            : "Ver as regras da estratégia"}
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {describeStrategy(cfg, "BNB").map((l, i) => (
                            <li key={i}>• {l}</li>
                          ))}
                          {cfg.buyTaxPct || cfg.sellTaxPct ? (
                            <li>
                              • Taxa do token já considerada: {cfg.buyTaxPct ?? 0}% na compra e{" "}
                              {cfg.sellTaxPct ?? 0}% na venda.
                            </li>
                          ) : null}
                        </ul>
                      </details>
                    </div>
                  ))}
                {mode === "grade" && (
                  <div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["lower_price", "Preço mínimo (BNB por token)"],
                          ["upper_price", "Preço máximo (BNB por token)"],
                          ["levels", "Número de faixas"],
                          ["order_bnb", "BNB por ordem"],
                          ["max_slippage_pct", "Variação aceita (%)"],
                          ["max_impact_pct", "Impacto máx. (%)"],
                          ["gas_reserve_bnb", "Reserva para gás (BNB)"],
                        ] as const
                      ).map(([k, l]) => (
                        <div key={k}>
                          <Label className="text-xs">{l}</Label>
                          <Input
                            type="number"
                            step="any"
                            disabled={armed}
                            value={f[k]}
                            onChange={(e) => setF({ ...f, [k]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      A cada queda de uma faixa, compra o valor por ordem; a cada alta, vende o
                      equivalente. Fora da faixa, para.
                    </p>
                    {lines.length > 0 && (
                      <p className="mt-2 break-words font-mono text-[10px] text-muted-foreground">
                        {lines.map((p) => p.toExponential(3)).join(" · ")}
                      </p>
                    )}
                    <Button className="mt-3" size="sm" disabled={armed} onClick={() => save()}>
                      Salvar grade
                    </Button>
                  </div>
                )}
              </Panel>
            </div>

            <Panel collapsible title={`Adicionar ou retirar saldo · ${walletName}`}>
              {w === null ? (
                <Unavailable reason="carregando" />
              ) : w.address ? (
                <div className="space-y-1 text-sm">
                  <p className="break-all font-mono text-xs">{w.address}</p>
                  <div className="flex flex-wrap gap-2 py-1">
                    <FundBotDialog
                      sourceAddress={sourceAddress}
                      botAddress={w.address}
                      onDone={load}
                      botBnb={bnb}
                      need={need}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(w.address!);
                        toast.success("Endereço copiado");
                      }}
                    >
                      Copiar endereço
                    </Button>
                    <a
                      className="inline-flex items-center text-xs text-primary underline"
                      href={`https://bscscan.com/address/${w.address}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver na BscScan
                    </a>
                  </div>
                  <p>
                    BNB:{" "}
                    {bnb !== null ? (
                      <span className="font-mono">
                        {bnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}
                      </span>
                    ) : (
                      <Unavailable reason="falha de consulta" />
                    )}
                  </p>
                  {bnb !== null && (
                    <p
                      className={
                        bnb < reserve ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                      }
                    >
                      {bnb < reserve
                        ? `O robô tem ${bnb} BNB, mas sua estratégia guarda ${reserve} BNB só para o gás (reserva de segurança). Para operar ele precisa de ~${need ? +need.total.toFixed(6) : reserve} BNB no total. Envie mais ou diminua a "reserva para gás" na estratégia.`
                        : "Saldo suficiente para o gás desta carteira."}
                    </p>
                  )}
                  {w.tokens
                    .filter((t) => Number(t.amount) > 0)
                    .map((t) => (
                      <p key={t.symbol}>
                        {t.symbol}:{" "}
                        <span className="font-mono">
                          {Number(t.amount).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        </span>
                      </p>
                    ))}
                  <BotWithdrawalPanel
                    walletScope={walletScope}
                    walletName={walletName}
                    sourceAddress={w.address}
                    onDone={load}
                  />
                </div>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(() => createW({ data: { walletScope } }), "Carteira do robô criada")
                  }
                >
                  Criar carteira do robô
                </Button>
              )}
            </Panel>

            <AuditPanel />

            <Panel collapsible title="Dúvidas comuns">
              <div className="space-y-3 text-sm">
                <Faq q="O robô usa a estratégia que eu salvei?">
                  Sim. No modo "Minha estratégia" ele lê a estratégia salva do token a cada 5
                  segundos. Se você aplicar uma nova versão da estratégia, o robô passa a segui-la
                  na próxima verificação. Um rascunho salvo ainda não altera as operações reais.
                </Faq>
                <Faq q="Ele considera a taxa do token?">
                  Sim. A taxa medida no contrato (ex.: 8% em alguns tokens) é descontada do valor
                  mínimo que ele aceita receber, e as metas de lucro da estratégia já estão
                  ajustadas para o ganho depois da taxa.
                </Faq>
                <Faq q="Ele pode comprar sem parar?">
                  Não. Ele respeita o máximo de compras, o limite de BNB investido, a pausa entre
                  operações, o limite de operações por dia e o limite de perda do dia. Faz no máximo
                  uma troca por minuto.
                </Faq>
                <Faq q="E se o preço não puder ser lido?">
                  Ele espera. Sem preço confiável ele não compra nem vende.
                </Faq>
                <Faq q="A carteira do robô é real?">
                  Sim. É um endereço de verdade na rede BSC, criado só para você. Toque em "Ver na
                  BscScan" para conferir saldo e operações.
                </Faq>
                <Faq q="O robô pode mexer na minha carteira pessoal?">
                  Não. Ele só usa o BNB que você enviar para a carteira dele. Sua carteira pessoal
                  continua 100% sua.
                </Faq>
                <Faq q="Como paro tudo?">
                  Toque em "Pausar robô" para impedir novas operações. Para retirar o saldo, abra
                  "Adicionar ou retirar saldo" e use "Devolver ativos à carteira mãe". Se houver uma
                  transação enviada, a retirada aguarda sua confirmação.
                </Faq>
              </div>
            </Panel>
          </div>
        </details>
      </div>
    </div>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  bot_wallet_created: "Carteira do robô criada",
  bot_funded: "Você abasteceu o robô",
  bot_withdraw: "Devolução de ativos · confira o resultado",
  bot_withdraw_failed: "Tentativa de devolução não concluída",
  bot_armed: "Robô ligado",
  bot_disarmed: "Robô desligado",
  bot_saved: "Configuração salva",
  bot_removed: "Robô removido · carteira e histórico preservados",
  strategies_reset: "Estratégias resetadas · bots preservados e pausados",
  execution_lock_reviewed: "Conferência concluída · carteira liberada",
};
/** Shows the user's own security/audit trail with BscScan links so every action can be checked on-chain. */
function AuditPanel() {
  const { user } = useAuth();
  const userId = user?.id;
  const [rows, setRows] = useState<Tables<"audit_log">[]>([]);
  useEffect(() => {
    setRows([]);
    if (!userId) return;
    let alive = true;
    supabase
      .from("audit_log")
      .select("*")
      .eq("user_id", userId)
      .neq("action", "bot_execution_progress")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (alive) setRows(data ?? []);
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  const links = (d: unknown): string[] => {
    const o = (d ?? {}) as { hash?: string; hashes?: string[]; address?: string };
    return [
      ...(o.hash ? [`tx/${o.hash}`] : []),
      ...(o.hashes ?? []).map((h) => `tx/${h}`),
      ...(o.address ? [`address/${o.address}`] : []),
    ];
  };
  return (
    <Panel collapsible title={`Histórico de segurança (${rows.length})`}>
      <p className="mb-2 text-xs text-muted-foreground">
        Tudo o que aconteceu com o seu robô fica registrado aqui. Movimentos de dinheiro têm link
        para conferir na BscScan, a rede pública.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
      ) : (
        rows.map((r) => {
          const d = (r.details ?? {}) as { asset?: string; amount?: number; to?: string };
          return (
            <div key={r.id} className="mb-2 rounded border border-border p-2 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">
                  {AUDIT_LABEL[r.action] ?? r.action}
                  {d.amount ? ` · ${d.amount} ${d.asset ?? ""}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              {d.to && <p className="break-all font-mono text-muted-foreground">Para: {d.to}</p>}
              {links(r.details).map((l) => (
                <a
                  key={l}
                  className="mr-3 text-primary underline"
                  href={`https://bscscan.com/${l}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver na BscScan
                </a>
              ))}
            </div>
          );
        })
      )}
    </Panel>
  );
}

function Info({
  label,
  value,
  bnb,
  usd,
}: {
  label: string;
  value: string;
  bnb?: number | undefined;
  usd?: number | undefined;
}) {
  return (
    <div className="rounded border border-border p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate font-mono">{value}</p>
      {(bnb !== undefined || usd !== undefined) && <FiatValue bnb={bnb} usd={usd} />}
    </div>
  );
}
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium">{q}</p>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function rawAmount(value: string | null | undefined, decimals: number) {
  if (value == null) return "Não apurado";
  try {
    return decimals === 18
      ? formatEther(BigInt(value ?? "0"))
      : formatUnits(BigInt(value ?? "0"), decimals);
  } catch {
    return "Não apurado";
  }
}
