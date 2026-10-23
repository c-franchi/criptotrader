import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin } from "@/components/AppShell";
import { getStrategyDraft, saveUserStrategy } from "@/lib/strategy.functions";
import { strategySchema } from "@/lib/strategyValidation";
import { EMPTY_CONFIG, describeStrategy, type StrategyConfig } from "@/lib/strategy";
import { ResetStrategiesButton } from "@/components/ResetStrategiesButton";
import { StrategyApplicationStatus } from "@/components/StrategyApplicationStatus";
import { StrategyPresetCard } from "@/components/StrategyPresetCard";
import { PRESETS, buildPreset, type PresetId } from "@/lib/presets";
import { breakEvenPct, taxFor } from "@/lib/tokens";
import { hasTokenTax, stopRealLossPct } from "@/lib/stopLoss";
import { recommendPreset } from "@/lib/recommend";
import { useCandles } from "@/hooks/useCandles";
import { TokenAlerts } from "@/components/TokenAlerts";
import { HelpTip } from "@/components/HelpTip";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { WalletPicker } from "@/components/WalletPicker";
import { AddTokenDialog } from "@/components/AddTokenDialog";
import { getMarket } from "@/lib/chain.functions";
import { getTokenTax } from "@/lib/userTokens.functions";
import { getFxQuote, getBnbBalance } from "@/lib/fx.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/estrategia")({
  head: () => ({
    meta: [
      { title: "Estratégia — CryptoBot" },
      {
        name: "description",
        content:
          "Configure regras de entrada, take-profit, stop-loss e limites de risco para cada token.",
      },
      { property: "og:title", content: "Estratégia — CryptoBot" },
      {
        property: "og:description",
        content:
          "Configure regras de entrada, take-profit, stop-loss e limites de risco para cada token.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequireLogin>
        <StrategyForm />
      </RequireLogin>
    </AppShell>
  ),
});

function StopPreview({ c, amount, symbol }: { c: StrategyConfig; amount: number; symbol: string }) {
  const tax = { buy: c.buyTaxPct ?? 0, sell: c.sellTaxPct ?? 0 };
  const loss = stopRealLossPct(c);
  const taxed = hasTokenTax(tax);
  return (
    <div
      className={cn(
        "mt-2 rounded-md border p-2.5 text-sm",
        loss != null && taxed
          ? "border-destructive/60 bg-destructive/10"
          : "border-border bg-muted/30",
      )}
    >
      <p>
        Taxas de {symbol}: <b>compra {tax.buy}%</b> · <b>venda {tax.sell}%</b>
        {!taxed && " (sem taxa)"}
      </p>
      {loss == null ? (
        <p className="mt-1 text-primary">
          Stop desativado: o robô nunca vende com prejuízo. Em quedas, faz as recompras previstas
          (preço médio) dentro do valor liberado e espera o preço voltar.
        </p>
      ) : (
        <p className="mt-1">
          Se o stop disparar, a perda estimada é de{" "}
          <b className="text-destructive">{loss.toFixed(2)}%</b>
          {amount > 0 && (
            <>
              {" "}
              ≈{" "}
              <b className="text-destructive">
                {((amount * loss) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB
              </b>{" "}
              sobre {amount.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB aplicados
            </>
          )}
          {c.stopLossMode !== "liquido" && taxed && <> (queda de {c.stopLossPct}% + taxas)</>}. Não
          inclui gás nem slippage.
        </p>
      )}
    </div>
  );
}

function Num({
  label,
  id,
  hint,
  help,
  value,
  onChange,
}: {
  label: string;
  id?: string;
  hint?: string;
  help?: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div>
      <div className="flex items-center gap-1">
        <Label htmlFor={fieldId} className="text-sm">
          {label}
        </Label>
        {help && (
          <HelpTip title={label}>
            <p>{help}</p>
          </HelpTip>
        )}
      </div>
      <Input
        id={fieldId}
        type="number"
        step="any"
        min={0}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StrategyForm() {
  const { user } = useAuth();
  const {
    walletScope,
    address: scopeAddress,
    setWalletDirty,
    ready: walletReady,
  } = useSelectedWallet();
  const { token, selectToken, tokens } = useSelectedToken();
  const [c, setC] = useState<StrategyConfig>(EMPTY_CONFIG);
  const [wallet, setWallet] = useState("");
  const [version, setVersion] = useState(0);
  const [activeVersion, setActiveVersion] = useState(0);
  const [activeConfig, setActiveConfig] = useState<StrategyConfig | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [draftNotice, setDraftNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const selectionKey = `${walletScope}:${token.address}`;
  const tokenRef = useRef(selectionKey);
  tokenRef.current = selectionKey;
  const savingRef = useRef(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const dirty = savedSnapshot != null && savedSnapshot !== JSON.stringify({ c, wallet });
  useEffect(() => {
    setWalletDirty(dirty);
    return () => setWalletDirty(false);
  }, [dirty, setWalletDirty]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const [liq, setLiq] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"BRL" | "BNB">("BRL");
  const [fx, setFx] = useState<{ bnbUsd: number | null; usdBrl: number | null } | null>(null);
  const [bnbBalance, setBnbBalance] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const set = <K extends keyof StrategyConfig>(k: K, v: StrategyConfig[K]) => {
    setEdited(true);
    setC((p) => ({ ...p, [k]: v }));
  };
  const [measured, setMeasured] = useState<
    { buy: number; sell: number } | null | "loading" | "fail"
  >(null);
  const auto = measured && typeof measured === "object" ? measured : null;
  const tax = taxFor(token.address, {
    buyTaxPct: c.buyTaxPct ?? auto?.buy,
    sellTaxPct: c.sellTaxPct ?? auto?.sell,
  });
  const measure = (apply: boolean) => {
    setMeasured("loading");
    getTokenTax({ data: { address: token.address } })
      .then((r) => {
        if (!r.tax) return void setMeasured("fail");
        setMeasured(r.tax);
        if (apply) {
          set("buyTaxPct", r.tax.buy);
          set("sellTaxPct", r.tax.sell);
        }
      })
      .catch(() => setMeasured("fail"));
  };
  const [pool, setPool] = useState<string | undefined>(undefined);
  const [botRunning, setBotRunning] = useState(false);
  const candles = useCandles(pool, token.address);
  const rec = useMemo(() => {
    const since = Date.now() / 1000 - 86400;
    return recommendPreset(
      (candles.data ?? []).filter((x) => x[0] >= since).map((x) => x[4]),
      tax,
    );
  }, [candles.data, tax.buy, tax.sell]);
  type Mode = "" | PresetId | "manual";
  const [mode, setMode] = useState<Mode>("");
  const preset = PRESETS.find((p) => p.id === mode) ?? null;
  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === "manual" && c.presetId) set("presetId", null);
  };
  const chosen = PRESETS.find((p) => p.id === c.presetId) ?? null;
  const applyPreset = (id: PresetId) => {
    setC(buildPreset(id, amountBnb, liq, tax));
    setEdited(false);
    const p = PRESETS.find((x) => x.id === id)!;
    toast.success(
      `"${p.name}" montada: compra ${token.symbol} com até ${amountBnb.toFixed(4)} BNB. Revise e salve.`,
    );
  };

  useEffect(() => {
    let alive = true;
    setLiq(null);
    setSavedSnapshot(null);
    setDraftRevision(0);
    setDraftNotice("");
    Promise.all([
      supabase
        .from("strategies")
        .select("*")
        .eq("wallet_scope", walletScope)
        .order("updated_at", { ascending: false }),
      getStrategyDraft({ data: { token: token.address, walletScope } }),
    ])
      .then(([{ data, error }, draft]) => {
        if (error) throw error;
        if (!alive) return;
        const rows = data ?? [];
        const own = rows.find((r) => r.token.toLowerCase() === token.address.toLowerCase());
        const trackedWallet = draft
          ? (draft.tracked_wallet ?? "")
          : (rows.find((r) => r.tracked_wallet)?.tracked_wallet ?? scopeAddress ?? "");
        setWallet(trackedWallet);
        const cfg = draft
          ? { ...EMPTY_CONFIG, ...draft.config }
          : own
            ? { ...EMPTY_CONFIG, ...(own.config as Partial<StrategyConfig>) }
            : EMPTY_CONFIG;
        setC(cfg);
        setSavedSnapshot(
          JSON.stringify({
            c: cfg,
            wallet: trackedWallet,
          }),
        );
        setMode(cfg.presetId ?? (own ? "manual" : ""));
        setActiveVersion(own?.version ?? 0);
        setActiveConfig(
          own ? { ...EMPTY_CONFIG, ...(own.config as Partial<StrategyConfig>) } : null,
        );
        setVersion(draft?.base_version ?? own?.version ?? 0);
        setDraftRevision(draft?.revision ?? 0);
        setDraftNotice(
          draft ? "Rascunho recuperado. Estes ajustes ainda não foram aplicados ao robô real." : "",
        );
        setEdited(false);
      })
      .catch(() => {
        if (alive)
          toast.error(
            "Não foi possível carregar a estratégia e o rascunho. Tente abrir esta tela novamente.",
          );
      });
    measure(false);
    setPool(undefined);
    setBotRunning(false);
    supabase
      .from("grid_bots")
      .select("id")
      .eq("wallet_scope", walletScope)
      .eq("armed", true)
      .ilike("token", token.address)
      .limit(1)
      .then(({ data }) => {
        if (alive) setBotRunning((data ?? []).length > 0);
      });
    getMarket({ data: { address: token.address } })
      .then((m) => {
        const sp = m.pools.find((p) => p.supported);
        if (alive) {
          setLiq(sp?.liquidityUsd ?? null);
          setPool(sp?.pairAddress);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token.address, walletScope, scopeAddress]);

  useEffect(() => {
    let alive = true;
    getFxQuote()
      .then((q) => alive && setFx(q))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setBnbBalance(null);
    if (/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      getBnbBalance({ data: { address: wallet } })
        .then((b) => alive && setBnbBalance(b))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [wallet]);

  const bnbBrl = fx?.bnbUsd != null && fx?.usdBrl != null ? fx.bnbUsd * fx.usdBrl : null;
  const typed = Number(amount) || 0;
  const amountBnb = currency === "BNB" ? typed : bnbBrl ? typed / bnbBrl : 0;
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const walletOk = /^0x[0-9a-fA-F]{40}$/.test(wallet);

  const errors: string[] = [];
  if (!(c.buyAmount > 0))
    errors.push("Informe o valor por compra em Valores das operações do robô.");
  if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) errors.push("Endereço de carteira inválido.");
  if (c.sizingMode === "percentual" && c.buyAmount > 100)
    errors.push("Percentual do saldo não pode passar de 100%.");
  if (c.takeProfits.some((t) => t.sellPct <= 0 || t.sellPct > 100))
    errors.push("Percentual vendido deve estar entre 0 e 100.");
  if (c.entryType === "medias" && c.maFast >= c.maSlow)
    errors.push("A média rápida deve ser menor que a lenta.");
  if (!Number.isFinite(c.stopLossPct) || c.stopLossPct < 0 || c.stopLossPct >= 100)
    errors.push("O limite do stop deve ser de 0 (desativado) até menos de 100%.");

  const [askStop, setAskStop] = useState(false);
  const requestSave = () => {
    if (errors.length) return;
    if (c.stopLossPct > 0) setAskStop(true);
    else void save();
  };
  const save = async () => {
    if (!user || !walletReady || errors.length) return;
    const validation = strategySchema.safeParse(c);
    if (!validation.success)
      return void toast.error(validation.error.issues[0]?.message ?? "Revise a estratégia");
    if (savingRef.current || savedSnapshot == null) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveUserStrategy({
        data: {
          token: token.address,
          config: c,
          wallet: wallet || null,
          version,
          draftRevision,
          walletScope,
        },
      });
      if (tokenRef.current !== selectionKey) return;
      setVersion(result.version);
      setDraftRevision(result.draftRevision);
      setSavedSnapshot(JSON.stringify({ c, wallet }));
      if (result.status === "draft") {
        setDraftNotice(result.message);
        const { data: latest } = await supabase
          .from("strategies")
          .select("version,config")
          .eq("wallet_scope", walletScope)
          .ilike("token", token.address)
          .maybeSingle();
        if (tokenRef.current !== selectionKey) return;
        if (latest) {
          setActiveVersion(latest.version);
          setActiveConfig({ ...EMPTY_CONFIG, ...(latest.config as Partial<StrategyConfig>) });
        }
        toast.warning(`A estratégia ainda não foi aplicada. ${result.message}`);
        return;
      }
      setActiveVersion(result.version);
      setActiveConfig(c);
      setDraftNotice("");
      toast.success(
        `Estratégia de ${token.symbol} aplicada (versão ${result.version}).${botRunning ? " O robô ligado usará as novas regras na próxima avaliação." : " O robô permanece desligado."}`,
      );
      setAskTrade(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const [askTrade, setAskTrade] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/40 p-3 text-sm">
          <b>Configuração avançada</b>
          <p>Para criar e configurar o robô em um só lugar, use o assistente em Meus robôs.</p>
          <Button className="mt-2" onClick={() => navigate({ to: "/grade" })}>
            Abrir Meus robôs
          </Button>
        </div>
        <nav
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest("a");
            if (!a) return;
            const target = document.getElementById(a.hash.slice(1));
            const details = target?.closest("details");
            if (details) details.open = true;
          }}
          aria-label="Seções da estratégia"
          className="flex flex-wrap gap-3 rounded-md border border-border p-3 text-sm"
        >
          <a href="#strategy-values" className="text-primary underline">
            Valores das operações
          </a>
          <a href="#strategy-entry" className="text-primary underline">
            Entrada
          </a>
          <a href="#strategy-exit" className="text-primary underline">
            Saída
          </a>
          <a href="#strategy-protection" className="text-primary underline">
            Proteções
          </a>
          <a href="#strategy-summary" className="text-primary underline">
            Resumo e salvar
          </a>
        </nav>
        <section id="strategy-values" className="scroll-mt-24">
          <Panel title="Valores das operações do robô">
            <p className="mb-3 text-sm text-muted-foreground">
              Estes são os valores que serão salvos e usados pelo robô automático de {token.symbol}
              na carteira selecionada. Você pode editar também nas estratégias prontas.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Como calcular cada compra
                <select
                  aria-label="Como calcular cada compra"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-3"
                  value={c.sizingMode}
                  onChange={(e) => set("sizingMode", e.target.value as "fixo" | "percentual")}
                >
                  <option value="fixo">Valor fixo em BNB</option>
                  <option value="percentual">Percentual do saldo disponível</option>
                </select>
              </label>
              <Num
                id="strategy-buy-amount"
                label={
                  c.sizingMode === "fixo"
                    ? "Valor por compra (BNB)"
                    : "Saldo disponível por compra (%)"
                }
                value={c.buyAmount}
                onChange={(n) => set("buyAmount", n)}
                hint={
                  c.sizingMode === "fixo" && bnbBrl
                    ? `Aproximadamente ${brl(c.buyAmount * bnbBrl)} por compra.`
                    : c.sizingMode === "fixo"
                      ? "Valor em BNB usado em cada compra. A taxa da rede fica fora deste valor."
                      : "O percentual considera o saldo liberado para este robô, depois das reservas."
                }
              />
              <Num
                label="Máximo de compras por posição"
                value={c.maxEntries}
                onChange={(n) => set("maxEntries", n)}
                hint="Na recuperação real, uma posição admite somente uma entrada."
              />
              <Num
                label="Capital máximo deste robô (BNB)"
                value={c.allocationBnb ?? 0}
                onChange={(n) => set("allocationBnb", n)}
                hint="0 = sem teto individual. A carteira continua compartilhada e o saldo não pode ser usado duas vezes."
              />
              <Num
                label="Máximo aplicado na posição (BNB)"
                value={c.maxExposureQuote}
                onChange={(n) => set("maxExposureQuote", n)}
                hint="0 = sem teto adicional por posição. O saldo liberado e o limite do robô continuam valendo."
              />
            </div>
            <p className="mt-3 text-sm">
              Depois de definir os valores e as regras, toque em{" "}
              <a href="#strategy-summary" className="text-primary underline">
                Salvar estratégia
              </a>{" "}
              e abra o robô para iniciar.
            </p>
          </Panel>
        </section>
        {botRunning && (
          <div className="rounded-md border border-primary/50 bg-primary/10 p-3 text-sm">
            <p className="font-semibold">
              Robô ligado para {token.symbol} — você pode ajustar sem desligar
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A carteira selecionada possui um robô ligado. Ajustes só passam a valer após aplicar
              uma nova versão; rascunhos não alteram as operações. A posição atual é preservada.
            </p>
          </div>
        )}
        <Panel title="Passo 1 · Carteira pessoal para operações manuais">
          <p className="mb-2 text-xs text-muted-foreground">
            Esta é a carteira usada ao operar manualmente. O robô automático usa uma carteira
            própria da área selecionada acima; envie saldo para ela na tela Robô.
          </p>
          <WalletPicker value={wallet} onPick={setWallet} />
          <Input
            className="mt-2"
            placeholder="ou cole o endereço 0x…"
            value={wallet}
            onChange={(e) => setWallet(e.target.value.trim())}
          />
          {walletOk ? (
            <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Saldo de BNB nesta carteira</p>
              <p className="text-xl font-semibold">
                {bnbBalance === null
                  ? "carregando…"
                  : `${Number(bnbBalance).toLocaleString("pt-BR", { maximumFractionDigits: 5 })} BNB`}
              </p>
              {bnbBalance !== null && bnbBrl && (
                <p className="text-sm text-muted-foreground">
                  ≈ {brl(Number(bnbBalance) * bnbBrl)}
                </p>
              )}
              {bnbBalance !== null && Number(bnbBalance) < 0.002 && (
                <p className="mt-1 text-xs text-destructive">
                  Saldo baixo: deixe pelo menos ~0,002 BNB para pagar as taxas de rede (gás).
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {wallet ? "Endereço inválido." : "Nenhuma carteira escolhida ainda."} O endereço
              sozinho não autoriza nenhuma movimentação.
            </p>
          )}
        </Panel>

        <fieldset disabled={!walletOk} className={walletOk ? "space-y-4" : "space-y-4 opacity-50"}>
          <Panel title="Passo 2 · Escolha o token">
            <div className="flex flex-wrap gap-2">
              {tokens.map((t) => (
                <Button
                  key={t.address}
                  size="sm"
                  variant={t.address === token.address ? "default" : "outline"}
                  onClick={() => selectToken(t.address)}
                >
                  {t.symbol}
                </Button>
              ))}
              <AddTokenDialog wallet={wallet || null} />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-border p-2">
                <span className="font-semibold">Comprar:</span> você paga <b>BNB</b> e recebe{" "}
                <b>{token.symbol}</b>
              </div>
              <div className="rounded-md border border-border p-2">
                <span className="font-semibold">Vender:</span> você entrega <b>{token.symbol}</b> e
                recebe <b>BNB</b>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Liquidez atual do pool {token.symbol}/BNB:{" "}
              {liq === null
                ? "indisponível"
                : `US$ ${liq.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
            </p>
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3">
              <p className="text-sm font-semibold">Taxa cobrada pelo {token.symbol}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">
                  Na compra (%)
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    max={50}
                    value={tax.buy}
                    onChange={(e) =>
                      set("buyTaxPct", Math.min(50, Math.max(0, Number(e.target.value) || 0)))
                    }
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Na venda (%)
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    max={50}
                    value={tax.sell}
                    onChange={(e) =>
                      set("sellTaxPct", Math.min(50, Math.max(0, Number(e.target.value) || 0)))
                    }
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {measured === "loading" && (
                  <span className="text-muted-foreground">Medindo a taxa direto no contrato…</span>
                )}
                {auto && (
                  <span>
                    ✓ Medido no contrato agora: compra <b>{auto.buy}%</b> · venda{" "}
                    <b>{auto.sell}%</b>
                  </span>
                )}
                {measured === "fail" && (
                  <span className="text-destructive">
                    Não deu para medir a taxa automaticamente. Preencha à mão.
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => measure(true)}
                  disabled={measured === "loading"}
                >
                  Medir de novo e usar
                </Button>
              </div>
              <p className="mt-2 text-xs">
                {tax.buy + tax.sell > 0 ? (
                  <>
                    Com essas taxas, o preço precisa subir <b>{breakEvenPct(tax).toFixed(1)}%</b> só
                    para empatar. As metas de venda das estratégias prontas já somam isso.
                  </>
                ) : (
                  "Nenhuma taxa informada. Se o token cobrar taxa, preencha aqui para a estratégia não vender no prejuízo."
                )}
              </p>
            </div>
          </Panel>

          <Panel title={`Passo 3 · Orçamento para montar uma estratégia pronta`}>
            <div className="mb-2 flex gap-2">
              {(["BRL", "BNB"] as const).map((cur) => (
                <Button
                  key={cur}
                  size="sm"
                  variant={currency === cur ? "default" : "outline"}
                  onClick={() => setCurrency(cur)}
                >
                  {cur === "BRL" ? "Real (R$)" : "BNB"}
                </Button>
              ))}
            </div>
            <Input
              type="number"
              step="any"
              min={0}
              placeholder={currency === "BRL" ? "ex.: 100" : "ex.: 0,1"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="mt-1 text-sm">
              {typed > 0 && amountBnb > 0 ? (
                <>
                  = <b>{amountBnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB</b>
                  {bnbBrl ? <> ≈ {brl(amountBnb * bnbBrl)}</> : null} que serão trocados por{" "}
                  {token.symbol}
                </>
              ) : currency === "BRL" && !bnbBrl ? (
                "Cotação do real indisponível agora; use BNB."
              ) : (
                "Digite um valor."
              )}
            </p>
            {bnbBalance !== null && amountBnb > Number(bnbBalance) && (
              <p className="text-xs text-destructive">
                Valor maior que o saldo de BNB da carteira.
              </p>
            )}

            <p className="mt-2 text-xs text-muted-foreground">
              Este orçamento monta os valores ao aplicar um modelo no passo 4. Digitar aqui não
              altera uma estratégia existente. Os valores efetivos ficam em “Valores das operações
              do robô”, no início da tela.
            </p>
          </Panel>

          <Panel title="Passo 4 · Como você quer operar?">
            <div className="flex items-center gap-1">
              <Label htmlFor="modo">Escolha o tipo de estratégia</Label>
              <HelpTip title="Tipos de estratégia">
                <p>
                  <b>Prontas (robô automático):</b> regras já montadas para o robô seguir sozinho. O
                  robô automático executa as regras reais quando estiver ligado e sem bloqueios de
                  execução.
                </p>
                <p>
                  <b>Manual:</b> você mesmo define quando comprar e vender, e recebe avisos no
                  celular para fazer a operação.
                </p>
              </HelpTip>
            </div>
            <select
              id="modo"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-3 text-base"
              value={mode}
              onChange={(e) => pickMode(e.target.value as Mode)}
            >
              <option value="">Toque para escolher…</option>
              <optgroup label="Prontas · também usadas pelo Robô automático">
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Você no controle">
                <option value="manual">Manual · eu configuro e recebo avisos</option>
              </optgroup>
            </select>

            {rec && (
              <div className="mt-3 rounded-md border border-primary/60 bg-primary/5 p-3 text-sm">
                <p className="font-semibold text-primary">
                  💡 Sugestão do robô para {token.symbol} hoje:{" "}
                  {PRESETS.find((p) => p.id === rec.id)?.name}
                </p>
                <p className="mt-1 text-muted-foreground">{rec.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Baseado no preço das últimas 24h. É uma sugestão, não garantia de lucro.
                </p>
                {c.presetId === rec.id ? (
                  <p className="mt-2 text-xs font-medium text-primary">
                    ✓ Você já está usando a recomendação.
                  </p>
                ) : (
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={!(amountBnb > 0)}
                    onClick={() => {
                      setMode(rec.id);
                      applyPreset(rec.id);
                    }}
                  >
                    Aplicar recomendação
                  </Button>
                )}
                {!(amountBnb > 0) && (
                  <p className="mt-1 text-xs text-destructive">
                    Digite o valor no passo 3 para aplicar.
                  </p>
                )}
              </div>
            )}

            {!mode && (
              <p className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Não sabe qual escolher? Comece pela <b>Entrada segura</b> para ver como funciona, ou
                pela <b>Manual</b> se quer apenas ser avisado e decidir sozinho.
              </p>
            )}

            {preset && (
              <StrategyPresetCard
                preset={preset}
                selected={c.presetId === preset.id}
                edited={edited}
                canApply={amountBnb > 0}
                onApply={() => applyPreset(preset.id)}
              />
            )}

            {mode === "manual" && (
              <div className="mt-3 rounded-md border-2 border-primary bg-primary/10 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-primary">
                  <Check className="h-4 w-4" /> Manual: você no controle
                </p>
                <p className="mt-1">
                  Abaixo aparecem as regras de compra e venda e os avisos no celular. Toque nos{" "}
                  <b>?</b> para entender cada campo. Quando o preço chegar perto do ponto, você
                  recebe o aviso e faz a operação em Operar.
                </p>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Nenhuma estratégia garante lucro.</p>
          </Panel>
        </fieldset>

        {mode && (
          <Panel title="Proteções · limite de perda da posição" collapsible>
            <div id="strategy-protection" className="scroll-mt-24" />
            <Label htmlFor="stop-mode">Regra do stop</Label>
            <select
              id="stop-mode"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-3 text-base"
              value={c.stopLossMode ?? "preco"}
              onChange={(e) => {
                set("stopLossMode", e.target.value as "preco" | "liquido");
                set("buyTaxPct", tax.buy);
                set("sellTaxPct", tax.sell);
              }}
            >
              <option value="preco">Queda do preço (regra atual)</option>
              <option value="liquido">Perda líquida (inclui taxas do token)</option>
            </select>
            <div className="mt-3">
              <Num
                label={
                  c.stopLossMode === "liquido"
                    ? "Limite de perda líquida (%)"
                    : "Limite de queda do preço (%)"
                }
                hint="0 = desativado (recomendado para tokens com taxa)"
                value={c.stopLossPct}
                onChange={(n) => set("stopLossPct", n)}
              />
            </div>
            <StopPreview
              c={{ ...c, buyTaxPct: tax.buy, sellTaxPct: tax.sell }}
              amount={c.maxExposureQuote || amountBnb}
              symbol={token.symbol}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              O stop tenta vender a posição, não desliga o robô nem bloqueia saques. Ele pode voltar
              a comprar conforme os limites da estratégia.
            </p>
            {c.stopLossMode === "liquido" && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Inclui taxas de compra e venda sobre o preço médio. Não inclui gás, slippage ou
                  impacto de preço; a perda real pode ser maior. Essa regra pode vender antes do
                  stop por preço, não aumenta o espaço para recuperação.
                </p>
                {c.stopLossPct > 0 &&
                  c.stopLossPct <= (1 - (1 - tax.buy / 100) * (1 - tax.sell / 100)) * 100 && (
                    <p role="alert" className="mt-2 text-sm text-destructive">
                      Só as taxas já representam{" "}
                      {((1 - (1 - tax.buy / 100) * (1 - tax.sell / 100)) * 100).toFixed(2)}% de
                      perda se vender pelo mesmo preço. Esse limite pode provocar venda na primeira
                      verificação após a compra. Revise antes de salvar.
                    </p>
                  )}
              </>
            )}
          </Panel>
        )}

        <section id="strategy-gas" className="scroll-mt-28">
          <Panel title="Reserva para taxas da rede">
            <p className="mb-3 text-sm text-muted-foreground">
              A reserva é BNB que fica disponível para pagar operações futuras; não é uma taxa
              cobrada por transação. O gás efetivo depende da rede e da operação.
            </p>
            <Num
              id="strategy-gas-reserve"
              label="Reserva do robô (BNB)"
              value={c.gasReserveBnb}
              onChange={(n) => set("gasReserveBnb", n)}
              hint="Você pode reduzir este valor. O robô ainda precisa de BNB suficiente para a taxa estimada de cada transação."
            />
            {c.gasReserveBnb === 0 && (
              <p className="mt-2 text-xs text-warning">
                Sem reserva configurada. Compras ainda precisam deixar BNB para a taxa; as vendas
                dependem do custo estimado, não desta reserva.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Depois de editar, use Salvar alterações ou Aplicar rascunho. A mudança vale somente
              para a estratégia e carteira selecionadas.
            </p>
          </Panel>
        </section>

        {mode === "manual" && (
          <>
            <div id="strategy-entry" className="scroll-mt-24" />
            <Panel title="Entrada · quando comprar" collapsible>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="flex items-center gap-1">
                    <Label>Tipo de sinal</Label>
                    <HelpTip title="Tipo de sinal">
                      <p>
                        <b>Queda percentual:</b> compra quando o preço cai X% — bom para comprar
                        barato.
                      </p>
                      <p>
                        <b>Cruzamento de médias:</b> exige tendência de alta e recuo até a média
                        lenta. Para comprar retomadas após quedas, use a recuperação real na
                        adaptativa.
                      </p>
                    </HelpTip>
                  </div>
                  <select
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={c.entryType}
                    onChange={(e) => {
                      set("entryType", e.target.value as "queda");
                      if (e.target.value !== "adaptativa" && c.recovery)
                        set("recovery", { ...c.recovery, enabled: false });
                    }}
                  >
                    <option value="queda">Queda percentual</option>
                    <option value="medias">Tendência + recuo (médias)</option>
                    <option value="adaptativa">Adaptativa (lê o padrão do preço)</option>
                  </select>
                </div>
                {c.entryType === "adaptativa" && (
                  <div className="space-y-3 rounded-md border border-primary/40 p-3">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={c.recovery?.enabled ?? false}
                        onChange={(e) =>
                          set("recovery", {
                            minDropPct: 8,
                            reboundPct: 2,
                            maxReboundPct: 8,
                            confirmationBars: 2,
                            minNetPct: 1.5,
                            ...c.recovery,
                            enabled: e.target.checked,
                          })
                        }
                      />
                      Comprar recuperação no robô REAL
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Ao salvar, substitui as entradas adaptativas por recuperação confirmada. Usa
                      velas fechadas, uma compra por fundo, sem recompra. Valores iniciais são
                      exemplos editáveis, sem desempenho comprovado. As proteções e saídas
                      continuam.
                    </p>
                    {c.recovery?.enabled && (
                      <>
                        <Num
                          label="Queda mínima (%)"
                          value={c.recovery.minDropPct}
                          onChange={(n) => set("recovery", { ...c.recovery!, minDropPct: n })}
                        />
                        <Num
                          label="Recuperação mínima desde o fundo (%)"
                          value={c.recovery.reboundPct}
                          onChange={(n) => set("recovery", { ...c.recovery!, reboundPct: n })}
                        />
                        <Num
                          label="Recuperação máxima para entrar (%)"
                          value={c.recovery.maxReboundPct}
                          onChange={(n) => set("recovery", { ...c.recovery!, maxReboundPct: n })}
                        />
                        <Num
                          label="Fechamentos consecutivos em alta"
                          value={c.recovery.confirmationBars}
                          onChange={(n) => set("recovery", { ...c.recovery!, confirmationBars: n })}
                        />
                        <Num
                          label="Meta líquida mínima estimada (%)"
                          value={c.recovery.minNetPct}
                          onChange={(n) => set("recovery", { ...c.recovery!, minNetPct: n })}
                        />
                      </>
                    )}
                  </div>
                )}
                {c.entryType === "queda" ? (
                  <>
                    <Num
                      label="Queda que dispara a compra (%)"
                      hint="Movimento do preço, não do saldo."
                      value={c.dropPct}
                      help="Quanto o preço precisa cair para comprar. Ex.: 10% significa comprar quando o token ficar 10% mais barato que a referência. Quedas maiores = compras mais raras e mais baratas."
                      onChange={(n) => set("dropPct", n)}
                    />
                    <div>
                      <div className="flex items-center gap-1">
                        <Label>Referência da queda</Label>
                        <HelpTip title="Referência da queda">
                          <p>
                            De onde a queda é contada: do preço mais alto recente (automático) ou de
                            um preço que você define.
                          </p>
                        </HelpTip>
                      </div>
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={c.referenceType}
                        onChange={(e) => set("referenceType", e.target.value as "manual")}
                      >
                        <option value="maxima">Máxima na janela</option>
                        <option value="manual">Preço definido por mim</option>
                      </select>
                    </div>
                    {c.referenceType === "manual" ? (
                      <Num
                        label="Preço de referência (moeda do par)"
                        value={c.manualReference}
                        help="Preço que você considera 'normal'. A queda é medida a partir dele. Use o preço de hoje se não souber."
                        onChange={(n) => set("manualReference", n)}
                      />
                    ) : (
                      <Num
                        label="Janela (horas)"
                        value={c.windowHours}
                        help="Período usado para achar o preço mais alto. Ex.: 24h = a queda é medida a partir da máxima do último dia."
                        onChange={(n) => set("windowHours", n)}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Num
                      label="Média rápida (velas)"
                      value={c.maFast}
                      help="Média do preço das últimas poucas velas. Reage rápido às mudanças."
                      onChange={(n) => set("maFast", n)}
                    />
                    <Num
                      label="Média lenta (velas)"
                      value={c.maSlow}
                      help="Média de mais velas, reage devagar. Quando a média rápida passa acima da lenta, sinal de que o preço começou a subir."
                      onChange={(n) => set("maSlow", n)}
                    />
                    <div>
                      <Label>Intervalo das velas</Label>
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={c.candleInterval}
                        onChange={(e) => set("candleInterval", e.target.value)}
                      >
                        {["5m", "15m", "1h", "4h"].map((i) => (
                          <option key={i}>{i}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <Num
                  label="Liquidez mínima (US$)"
                  value={c.minLiquidityUsd}
                  help="Dinheiro disponível no pool para trocas. Pouca liquidez = preço salta muito e pode ser difícil vender. Abaixo deste valor, não compra."
                  onChange={(n) => set("minLiquidityUsd", n)}
                />

                <Num
                  label="Intervalo mínimo entre compras (min)"
                  value={c.cooldownMin}
                  help="Tempo mínimo de espera entre uma compra e outra, para não gastar tudo numa queda rápida."
                  onChange={(n) => set("cooldownMin", n)}
                />

                <Num
                  label="Máx. operações por dia"
                  value={c.maxTradesPerDay}
                  help="Limite de operações por dia. Menos operações = menos taxas pagas."
                  onChange={(n) => set("maxTradesPerDay", n)}
                />
              </div>
            </Panel>

            <Panel title="Versão das regras e orçamento">
              <p className="mb-3 text-xs text-muted-foreground">
                Ciclos antigos preservam as regras salvas. A versão 2 exige rearme em entradas por
                médias e respeita o percentual de cada alvo. Posições abertas impedem alteração de
                configuração.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.rulesVersion === 2}
                  onChange={(e) => set("rulesVersion", e.target.checked ? 2 : 1)}
                />
                Usar regras versão 2
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.taxVerified === true}
                  onChange={(e) => set("taxVerified", e.target.checked)}
                />
                Confirmo os percentuais de taxa de compra e venda informados
              </label>
              <p className="mt-2 text-xs text-warning">
                Taxa desconhecida não significa taxa zero. Metas de lucro descontam as taxas do
                token; gás, DEX e execução ainda precisam ser considerados.
              </p>
            </Panel>
            <div id="strategy-exit" className="scroll-mt-24" />
            <Panel
              title="Saída · metas de venda e stop móvel"
              collapsible
              right={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => set("takeProfits", [...c.takeProfits, { pct: 0, sellPct: 0 }])}
                >
                  + Take-profit
                </Button>
              }
            >
              <div className="space-y-3">
                {c.takeProfits.map((t, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
                  >
                    <Num
                      label={`TP ${i + 1}: valorização sobre preço médio (%)`}
                      help="Take-profit (realizar lucro): quando o preço subir esse % acima do que você pagou, vende uma parte. Ex.: +10% vende metade e garante o ganho."
                      value={t.pct}
                      onChange={(n) =>
                        set(
                          "takeProfits",
                          c.takeProfits.map((x, j) => (j === i ? { ...x, pct: n } : x)),
                        )
                      }
                    />
                    <Num
                      label="% do saldo remanescente vendido"
                      help="Quanto do que sobrou vender nesse alvo. 100% = vende tudo."
                      value={t.sellPct}
                      onChange={(n) =>
                        set(
                          "takeProfits",
                          c.takeProfits.map((x, j) => (j === i ? { ...x, sellPct: n } : x)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        set(
                          "takeProfits",
                          c.takeProfits.filter((_, j) => j !== i),
                        )
                      }
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Num
                    label="Limite de perda diária (moeda do par)"
                    value={c.dailyLossLimit}
                    help="Se as perdas do dia chegarem a esse valor, o robô para até o dia seguinte."
                    onChange={(n) => set("dailyLossLimit", n)}
                  />
                  <Num
                    label="Slippage máximo (%)"
                    value={c.maxSlippagePct}
                    help="Quanto o preço pode mudar entre a cotação e a execução. Tokens com taxa precisam de um valor um pouco maior."
                    onChange={(n) => set("maxSlippagePct", n)}
                  />
                  <Num
                    label="Impacto de preço máximo (%)"
                    value={c.maxPriceImpactPct}
                    help="Quanto a sua própria compra/venda move o preço. Alto = você paga mais caro. Evite passar de 3%."
                    onChange={(n) => set("maxPriceImpactPct", n)}
                  />
                  <Num
                    label="Gas máximo (gwei)"
                    value={c.maxGasGwei}
                    help="Preço máximo da taxa de rede. Se a rede estiver cara, espera."
                    onChange={(n) => set("maxGasGwei", n)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Transações pendentes não são repetidas automaticamente. Uma nova tentativa
                    depende da conciliação do hash.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={c.trailingEnabled}
                    onCheckedChange={(v) => set("trailingEnabled", v)}
                  />
                  <span className="text-sm">Trailing stop</span>
                  <HelpTip title="Trailing stop (stop móvel)">
                    <p>
                      Segue o preço para cima. Depois de lucrar, se o preço virar e cair um pouco do
                      topo, vende e garante o ganho.
                    </p>
                  </HelpTip>
                </div>
                {c.trailingEnabled && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Num
                      label="Lucro para ativar (%)"
                      value={c.trailingActivatePct}
                      help="Lucro a partir do qual o 'stop móvel' começa a seguir o preço."
                      onChange={(n) => set("trailingActivatePct", n)}
                    />
                    <Num
                      label="Distância da máxima (%)"
                      value={c.trailingDistancePct}
                      help="Se o preço cair esse % do ponto mais alto depois de ativado, vende e garante o lucro."
                      onChange={(n) => set("trailingDistancePct", n)}
                    />
                  </div>
                )}
              </div>
            </Panel>
            <TokenAlerts token={token} tax={tax} />
          </>
        )}
      </div>

      <div
        id="strategy-summary"
        className="min-w-0 scroll-mt-24 space-y-4 break-words lg:sticky lg:top-20 lg:self-start"
      >
        <div
          role="status"
          className={`rounded-md border p-3 text-sm ${dirty ? "border-warning/40 text-warning" : "border-border text-muted-foreground"}`}
        >
          {savedSnapshot == null
            ? "Carregando estratégia…"
            : dirty
              ? "Alterações ainda não salvas"
              : draftRevision > 0
                ? `Rascunho salvo · versão real ${activeVersion} preservada`
                : `Estratégia sem alterações pendentes · versão ${activeVersion}`}
          {draftNotice && (
            <p className="mt-2 text-warning">
              {draftNotice} Confira o motivo abaixo. Depois de resolver o bloqueio, clique em
              Aplicar rascunho.
            </p>
          )}
          {draftRevision > 0 && (
            <StrategyApplicationStatus walletScope={walletScope} token={token.address} />
          )}
          {draftRevision > 0 && version !== activeVersion && (
            <div className="mt-3 space-y-2">
              <details>
                <summary className="cursor-pointer underline">
                  Comparar com a estratégia real v{activeVersion}
                </summary>
                <ul className="mt-2 space-y-2">
                  {(activeConfig
                    ? describeStrategy(activeConfig)
                    : ["Nenhuma estratégia real salva para este token."]
                  ).map((line, i) => (
                    <li key={i}>• {line}</li>
                  ))}
                </ul>
              </details>
              <Button
                variant="outline"
                className="h-auto w-full whitespace-normal"
                onClick={() => setVersion(activeVersion)}
                disabled={saving}
              >
                Revisei os campos; usar a versão real v{activeVersion} como base
              </Button>
            </div>
          )}
          <Button
            className="mt-2 w-full"
            disabled={
              saving ||
              savedSnapshot == null ||
              (!dirty && draftRevision === 0 && activeVersion > 0) ||
              errors.length > 0
            }
            onClick={requestSave}
          >
            {saving ? "Salvando…" : draftRevision > 0 ? "Aplicar rascunho" : "Salvar estratégia"}
          </Button>
          {activeVersion > 0 && draftRevision === 0 && (
            <Button
              variant="outline"
              className="mt-2 w-full"
              onClick={() => navigate({ to: "/grade" })}
            >
              Abrir robô e gráfico
            </Button>
          )}
        </div>
        <ResetStrategiesButton key={walletScope} walletScope={walletScope} />
        <Panel title="Prévia em linguagem simples">
          {chosen && (
            <p className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 p-2 text-sm font-semibold text-primary">
              <Check className="h-4 w-4 shrink-0" /> {chosen.name}
              {edited && (
                <span className="font-normal text-muted-foreground">(com ajustes manuais)</span>
              )}
            </p>
          )}
          <ul className="min-w-0 space-y-2 break-words text-sm">
            {describeStrategy(c).map((l, i) => (
              <li key={i}>• {l}</li>
            ))}
          </ul>
          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <AlertDialog open={askTrade} onOpenChange={setAskTrade}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Estratégia salva! Abrir o robô?</AlertDialogTitle>
                <AlertDialogDescription>
                  A estratégia de {token.symbol} está salva. Abra a sala do robô para conferir os
                  valores, o saldo disponível e o gráfico, e iniciar quando estiver pronto. Salvar a
                  estratégia não inicia operações automaticamente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Agora não</AlertDialogCancel>
                <AlertDialogAction onClick={() => navigate({ to: "/grade" })}>
                  Abrir robô e gráfico
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={askStop} onOpenChange={setAskStop}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar stop loss de {c.stopLossPct}%?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      Se o stop disparar, o robô <b>vende os {token.symbol} com prejuízo</b> e você
                      não fica com os tokens para esperar a recuperação.
                    </p>
                    <StopPreview
                      c={{ ...c, buyTaxPct: tax.buy, sellTaxPct: tax.sell }}
                      amount={c.maxExposureQuote || amountBnb}
                      symbol={token.symbol}
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    set("stopLossPct", 0);
                  }}
                >
                  Desativar stop
                </AlertDialogCancel>
                <AlertDialogAction onClick={() => void save()}>
                  Entendi, salvar com stop
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            className="mt-4 h-auto min-h-10 w-full whitespace-normal break-words"
            onClick={requestSave}
            disabled={saving || savedSnapshot == null || errors.length > 0}
          >
            {saving ? "Salvando…" : draftRevision > 0 ? "Aplicar rascunho" : "Salvar estratégia"}
            {chosen ? ` · ${chosen.name}` : ""}
            {activeVersion ? ` (real v${activeVersion})` : ""}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Salvar não liga um robô desligado. Uma estratégia aplicada pode ser usada por um robô já
            ligado na próxima avaliação. Se houver bloqueio ou posição aberta, os ajustes ficam como
            rascunho e não alteram as regras reais.
          </p>
        </Panel>
      </div>
    </div>
  );
}
