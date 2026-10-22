import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
  withdrawBot,
} from "@/lib/bot.functions";
import { AddTokenDialog } from "@/components/AddTokenDialog";
import { ChevronDown } from "lucide-react";
import { WalletCapitalPanel } from "@/components/WalletCapitalPanel";
import { ResetStrategiesButton } from "@/components/ResetStrategiesButton";
import { formatEther, formatUnits } from "viem";
import { HelpTip } from "@/components/HelpTip";
import { RobotVision } from "@/components/RobotVision";
import { FundBotDialog } from "@/components/FundBotDialog";
import { requiredBotBnb } from "@/lib/botFunding";
import { useSavedWallets } from "@/hooks/useSavedWallets";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_CONFIG, describeStrategy, type StrategyConfig } from "@/lib/strategy";
import { PRESETS } from "@/lib/presets";
import { normalizeState } from "@/lib/autoStrategy";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/grade")({
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

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`flex gap-3 rounded-md border p-2.5 ${done ? "border-success/40 bg-success/5" : "border-border"}`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-success text-success-foreground" : "bg-secondary text-muted-foreground"}`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">
          {title} {done && <span className="text-xs text-success">· pronto</span>}
        </p>
        {!done && children && <div className="mt-1 text-xs text-muted-foreground">{children}</div>}
      </div>
    </li>
  );
}

function Robo() {
  const { user } = useAuth();
  const {
    walletScope,
    name: walletName,
    wallets: scopeWallets,
    selectWallet,
    ready: walletReady,
  } = useSelectedWallet();
  const getW = useServerFn(getBotWallet),
    createW = useServerFn(createBotWallet),
    withdraw = useServerFn(withdrawBot),
    runNow = useServerFn(runGridNow);
  const { token: selected, selectToken: setToken, tokens } = useSelectedToken();
  const token = selected.address;
  const sym = selected.symbol;
  const [w, setW] = useState<Wallet | null>(null);
  const [bot, setBot] = useState<Bot | null>(null);
  const [mode, setMode] = useState<Mode>("estrategia");
  const [cfg, setCfg] = useState<StrategyConfig | null | undefined>(undefined);
  const [f, setF] = useState(blank);
  const [orderLimit, setOrderLimit] = useState(20);
  const [orders, setOrders] = useState<Tables<"orders">[]>([]);
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
    const timer = setInterval(refresh, 60000);
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
  const { wallets: saved } = useSavedWallets();
  const [dest, setDest] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
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

  const load = useCallback(async () => {
    const key = `${walletScope}:${token}`;
    void getExecutionStatus({ data: { walletScope } })
      .then((value) => {
        if (selectionRef.current === key) setExecution(value);
      })
      .catch(() => {
        if (selectionRef.current === key) setExecution(null);
      });
    getW({ data: { walletScope } })
      .then((value) => {
        if (selectionRef.current === key) setW(value);
      })
      .catch(() => {
        if (selectionRef.current === key) setW({ address: null, bnb: null, tokens: [] });
      });
    const { data: list } = await supabase
      .from("grid_bots")
      .select("*")
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
  }, [token, getW, orderLimit, walletScope]);
  useEffect(() => {
    setW(null);
    setBot(null);
    setCfg(undefined);
    setExecution(null);
    setOrders([]);
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const persist = async (armed?: boolean) => {
    if (!user || !walletReady) return;
    if (armed && !w?.address) return void toast.error("Crie a carteira do robô antes de ligar");
    let row: Record<string, unknown> = {
      user_id: user.id,
      wallet_scope: walletScope,
      token,
      mode,
      armed: armed ?? bot?.armed ?? false,
      updated_at: new Date().toISOString(),
    };
    if (armed && !cfg)
      return void toast.error(`Configure e salve a estratégia de ${sym} antes de iniciar`);
    if (mode === "estrategia") {
      if (armed && !cfg)
        return void toast.error(`Salve uma estratégia para ${sym} antes de ligar o robô`);
    } else {
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
  const hasFunds = bnb != null && bnb > reserve;
  const st = normalizeState(bot?.strat_state, Date.now());
  const preset = cfg?.presetId ? PRESETS.find((p) => p.id === cfg.presetId) : undefined;
  const armed = !!bot?.armed;
  const lo = Number(f.lower_price),
    hi = Number(f.upper_price),
    lv = Number(f.levels);
  const lines =
    hi > lo && lv >= 2 && lv <= 100
      ? Array.from({ length: lv + 1 }, (_, i) => lo + (i * (hi - lo)) / lv)
      : [];

  return (
    <div
      className={
        fullscreen ? "fixed inset-0 z-50 overflow-y-auto bg-background p-3 sm:p-5" : "space-y-4"
      }
    >
      <div className="mx-auto w-full max-w-[1700px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Sala do robô</h1>
            <p className="text-sm text-muted-foreground">
              {sym} · {walletName} · gráfico, saldo, análise e operações juntos
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFullscreen(!fullscreen)}>
              {fullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
            </Button>
            <ResetStrategiesButton
              key={walletScope}
              walletScope={walletScope}
              onDone={() => {
                void load();
                setAnalysis(null);
              }}
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Criar ou abrir robô para o token:</p>
          <div data-token-picker className="flex flex-wrap gap-2">
            {tokens.map((t) => (
              <Button
                key={t.address}
                size="sm"
                variant={t.address === token ? "default" : "secondary"}
                onClick={() => setToken(t.address)}
              >
                {allBots.some((b) => b.armed && b.token.toLowerCase() === t.address.toLowerCase())
                  ? "● "
                  : ""}
                {t.symbol}
              </Button>
            ))}
            <AddTokenDialog />
          </div>
        </div>

        <WalletCapitalPanel
          key={selectionKey}
          walletScope={walletScope}
          previewId={!armed ? bot?.id : undefined}
          locked={execution?.locked}
          tokens={tokens}
        />
        <div className="grid items-start gap-4 xl:grid-cols-[350px_minmax(0,1fr)]">
          <Panel title={`Robô · ${sym} · ${walletName}`}>
            <p role="status" className="text-lg font-semibold">
              {!execution
                ? "Consultando estado…"
                : execution.locked
                  ? "Conciliação pendente na carteira"
                  : !armed
                    ? "Pausado"
                    : bot?.last_error
                      ? "Precisa de atenção"
                      : !bot?.last_run_at || Date.now() - Date.parse(bot.last_run_at) > 180000
                        ? "Aguardando o executor"
                        : "Ligado · acompanhando o mercado"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {execution?.locked
                ? "A carteira está conferindo uma operação. Você pode pausar o robô; novas operações aguardam a confirmação."
                : !armed
                  ? "Escolha a estratégia e toque em Iniciar robô quando estiver pronto."
                  : bot?.last_error ||
                    bot?.last_reason ||
                    "O robô confere as condições de compra e venda a cada minuto."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {armed ? (
                <Button disabled={saving} variant="destructive" onClick={() => save(false)}>
                  Pausar robô
                </Button>
              ) : (
                <Button
                  disabled={
                    saving || !walletReady || !execution || execution.locked || !w?.address || !cfg
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
              <Button variant="outline" disabled={busy} onClick={load}>
                Atualizar estado
              </Button>
              <Link
                to="/estrategia"
                className="inline-flex items-center px-2 text-sm text-primary underline"
              >
                Editar estratégia
              </Link>
            </div>
            {!cfg && (
              <p className="mt-3 rounded-md border border-warning/40 p-2 text-sm text-warning">
                Estratégia não configurada. Salve novas regras em Editar estratégia antes de
                iniciar. O reset mantém o bot pausado.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Operações com dinheiro real. Nenhuma estratégia garante lucro. Bots da mesma carteira
              compartilham o saldo; a tabela acima mostra o capital reservado e o livre.
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
                label="Estratégia"
                value={
                  mode === "grade"
                    ? "Grade de preços"
                    : (preset?.name ?? (cfg ? "Personalizada" : "Não configurada"))
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
          <Panel title="Gráfico ao vivo e análise do robô">
            <p className="mb-2 text-sm">
              {analysisError
                ? "Análise indisponível no momento."
                : (analysis?.error ?? analysis?.reason ?? "Consultando mercado…")}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              Veja no gráfico onde o robô vai comprar e vender, e cada operação que ele já fez.
            </p>
            <div className="mt-3">
              <RobotVision
                token={token}
                symbol={sym}
                cfg={cfg}
                state={st}
                mode={mode}
                grid={lines}
                orders={orders}
                armed={armed}
                reason={bot?.last_reason}
                evaluatedAt={bot?.last_run_at}
                executionBlocked={execution?.locked}
                serverAnalysis={analysisError ? null : analysis}
              />
            </div>
          </Panel>
        </div>
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
                    value={
                      st.avgPriceUsd > 0 ? `US$ ${st.avgPriceUsd.toPrecision(4)}` : "sem posição"
                    }
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
                    value={st.costBnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}
                  />
                  <Info
                    label="Operações hoje"
                    value={`${st.tradesToday} de ${cfg?.maxTradesPerDay ?? "—"}`}
                  />
                  <Info
                    label="Último preço visto"
                    value={bot?.last_price ? `US$ ${Number(bot.last_price).toPrecision(4)}` : "—"}
                  />
                </div>
              ) : (
                <p className="text-xs">
                  Faixa atual: {bot?.last_level ?? "—"} de {bot?.levels ?? "—"}
                </p>
              )}
              <Button
                variant="secondary"
                disabled={busy || !bot || !armed || execution?.locked}
                onClick={() =>
                  confirm(
                    "Executar uma avaliação agora? Se houver um sinal válido, o robô poderá enviar uma operação real.",
                  ) && act(() => runNow({ data: { token, walletScope } }), "Avaliação executada")
                }
              >
                Avaliar e operar agora
              </Button>
            </div>
          </Panel>
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
                  <div className="my-2 grid grid-cols-2 gap-2">
                    <p>
                      Valor da ordem:{" "}
                      <b>
                        {rawAmount(o.amount_in, o.side === "compra" ? 18 : selected.decimals)}{" "}
                        {o.side === "compra" ? "BNB" : sym}
                      </b>
                    </p>
                    <p>
                      Gás registrado:{" "}
                      <b>{o.gas_bnb == null ? "Não apurado" : `${o.gas_bnb} BNB`}</b>
                    </p>
                    {o.side === "venda" && (
                      <p>
                        BNB recebido:{" "}
                        <b>
                          {o.actual_bnb_received == null
                            ? "Não apurado no receipt/trace"
                            : `${o.actual_bnb_received} BNB`}
                        </b>
                      </p>
                    )}
                    <p>
                      Contabilidade: {o.accounting_status ?? "Registro legado; conferir auditoria"}
                    </p>
                  </div>
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
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Meus bots, configurações, depósitos e histórico de auditoria
          </summary>
          <div className="mt-4 space-y-4">
            <Panel
              collapsible
              title={`Meus robôs (${allBots.filter((b) => b.armed).length} ligado${allBots.filter((b) => b.armed).length === 1 ? "" : "s"})`}
            >
              <p className="mb-2 text-xs text-muted-foreground">
                Você pode ter <strong className="text-foreground">um robô para cada token</strong>,
                em cada carteira. Eles continuam ativos ao trocar a visualização. Toque em um robô
                para abrir a carteira e o token correspondentes.
              </p>
              {allBots.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum robô criado ainda. Escolha um token abaixo e siga os passos.
                </p>
              ) : (
                <ul className="space-y-2">
                  {allBots.map((b) => {
                    const tk = tokens.find(
                      (t) => t.address.toLowerCase() === b.token.toLowerCase(),
                    );
                    const active =
                      b.wallet_scope === walletScope &&
                      b.token.toLowerCase() === token.toLowerCase();
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
                            setToken(tk?.address ?? b.token);
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
                              {b.armed ? "● Ligado" : "○ Desligado"}
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

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
                  "Desligar e devolver tudo".
                </li>
              </ul>
            </Panel>

            {(!w?.address || !hasFunds || !cfg) && (
              <Panel title="Preparar robô">
                <ol className="space-y-2">
                  <Step n={1} done={!!w?.address} title="Criar a carteira do robô">
                    Crie uma carteira automática separada para {walletName}. Ela usa apenas o saldo
                    que você enviar; as outras carteiras continuam independentes.
                    <div className="mt-2">
                      <Button
                        size="sm"
                        disabled={busy || !walletReady}
                        onClick={() =>
                          act(
                            () => createW({ data: { walletScope } }),
                            "Carteira automática criada",
                          )
                        }
                      >
                        Criar carteira automática
                      </Button>
                    </div>
                  </Step>
                  <Step n={2} done={hasFunds} title="Colocar BNB na carteira do robô">
                    Toque em "Enviar BNB da minha carteira" (abaixo), escolha o valor e confirme no
                    app da sua carteira. Ele precisa de BNB para comprar e um pouquinho para o gás (
                    {reserve} BNB fica guardado para isso).
                    {w?.address && (
                      <div className="mt-2">
                        <FundBotDialog
                          botAddress={w.address}
                          onDone={load}
                          botBnb={bnb}
                          need={need}
                        />
                      </div>
                    )}
                  </Step>
                  <Step n={3} done={!!cfg} title={`Salvar uma estratégia para ${sym}`}>
                    O robô faz exatamente o que a estratégia diz.{" "}
                    <Link to="/estrategia" className="text-primary underline">
                      Criar estratégia ›
                    </Link>
                  </Step>
                  <Step n={4} done={armed} title="Iniciar o robô">
                    Revise o resumo abaixo e toque em "Iniciar robô".
                  </Step>
                </ol>
              </Panel>
            )}

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
                          ✓ {preset ? preset.name : "Estratégia manual"} · {sym}
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
                    <FundBotDialog botAddress={w.address} onDone={load} botBnb={bnb} need={need} />
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
                  <div className="mt-3 rounded-md border border-warning/50 bg-warning/10 p-3">
                    <p className="font-semibold">Retirar saldo e pausar os robôs desta carteira</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A qualquer momento: o robô é{" "}
                      <strong className="text-foreground">desligado na hora</strong>, os tokens que
                      ele comprou e todo o BNB voltam para a carteira que você escolher abaixo (só
                      fica o necessário para a taxa da rede). Os tokens voltam como tokens — se
                      quiser BNB, venda-os depois em Operar.
                    </p>
                    {(() => {
                      const ok = (c: { created_at?: string }) =>
                        !!c.created_at &&
                        Date.now() - new Date(c.created_at).getTime() >= 24 * 3600 * 1000;
                      const eligible = saved.filter(ok);
                      if (saved.length === 0)
                        return (
                          <p className="mt-2 text-xs">
                            Primeiro salve sua carteira em{" "}
                            <Link to="/carteiras" className="text-primary underline">
                              Minhas carteiras
                            </Link>
                            . Por segurança, ela poderá receber 24 horas depois.
                          </p>
                        );
                      return (
                        <div className="mt-2 space-y-2">
                          <select
                            className="w-full rounded-md border border-border bg-background p-2 text-sm"
                            value={dest}
                            onChange={(e) => setDest(e.target.value)}
                          >
                            <option value="">Escolha para onde devolver…</option>
                            {saved.map((c) => (
                              <option key={c.id} value={c.address} disabled={!ok(c)}>
                                {c.label || "Carteira"} · {c.address.slice(0, 6)}…
                                {c.address.slice(-4)}
                                {ok(c) ? "" : " (liberada 24h após salvar)"}
                              </option>
                            ))}
                          </select>
                          {eligible.length === 0 && (
                            <p className="text-xs">
                              Sua carteira foi salva há menos de 24 horas. Essa espera protege seu
                              dinheiro caso alguém invada sua conta.
                            </p>
                          )}
                          <Button
                            className="w-full"
                            variant="destructive"
                            disabled={busy || !dest}
                            onClick={() =>
                              confirm(
                                "Pausar os robôs desta carteira e devolver seu saldo para o destino escolhido? Os robôs das outras carteiras continuam ativos.",
                              ) &&
                              act(
                                () => withdraw({ data: { to: dest, walletScope } }),
                                "Devolução enviada. Confira na sua carteira em alguns segundos.",
                              )
                            }
                          >
                            Desligar e devolver tudo
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
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
                  Sim. No modo "Minha estratégia" ele lê a estratégia salva do token a cada minuto.
                  Se você aplicar uma nova versão da estratégia, o robô passa a segui-la na próxima
                  verificação. Um rascunho salvo ainda não altera as operações reais.
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
                  "Adicionar ou retirar saldo" e use "Desligar e devolver tudo". Se houver uma
                  transação enviada, a retirada aguarda sua confirmação.
                </Faq>
              </div>
            </Panel>
          </div>
        </details>
        <Button
          variant="outline"
          size="sm"
          disabled={orders.length < orderLimit}
          onClick={() => setOrderLimit((n) => n + 20)}
        >
          Carregar mais operações
        </Button>
      </div>
    </div>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  bot_wallet_created: "Carteira do robô criada",
  bot_funded: "Você abasteceu o robô",
  bot_withdraw: "Saldo devolvido para sua carteira",
  bot_armed: "Robô ligado",
  bot_disarmed: "Robô desligado",
  bot_saved: "Configuração salva",
  strategies_reset: "Estratégias resetadas · bots preservados e pausados",
  execution_lock_reviewed: "Conferência concluída · carteira liberada",
};
/** Shows the user's own security/audit trail with BscScan links so every action can be checked on-chain. */
function AuditPanel() {
  const [rows, setRows] = useState<Tables<"audit_log">[]>([]);
  useEffect(() => {
    supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setRows(data ?? []));
  }, []);
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate font-mono">{value}</p>
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
