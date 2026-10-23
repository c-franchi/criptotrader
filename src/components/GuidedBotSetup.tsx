import { getTokenTax } from "@/lib/userTokens.functions";
import { useEffect, useId, useState } from "react";
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
import { getFxQuote } from "@/lib/fx.functions";
import { createBotWallet, type getBotWallet } from "@/lib/bot.functions";
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

type Wallet = Awaited<ReturnType<typeof getBotWallet>>;
type GuidedForm = Omit<GuidedInput, "taxConfirmed"> & { taxConfirmed: boolean };
const initial: GuidedForm = {
  model: "dca",
  capital: 0,
  buyAmount: 0,
  dropPct: 5,
  maxEntries: 1,
  cooldownMin: 60,
  maxTradesPerDay: 3,
  profitPct: 4,
  stopPct: 8,
  reserve: 0.0001,
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
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
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
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs font-normal text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
export function GuidedBotSetup({
  open,
  onOpenChange,
  walletScope,
  walletName,
  token,
  symbol,
  wallet,
  onDone,
  tokens,
  onSelectToken,
  walletOptions,
  onSelectWallet,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  walletScope: string;
  walletName: string;
  token: string;
  symbol: string;
  wallet: Wallet | null;
  onDone: () => Promise<void>;
  tokens?: { address: string; symbol: string }[];
  onSelectToken?: (address: string) => void;
  walletOptions?: { id: string; label: string }[];
  onSelectWallet?: (id: string) => void;
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
  const qc = useQueryClient();
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
  const rate = fx.data?.bnbUsd && fx.data.usdBrl ? fx.data.bnbUsd * fx.data.usdBrl : null;
  const readiness = useQuery({
    queryKey: ["bot-readiness", walletScope, token],
    queryFn: () => getBotReadiness({ data: { walletScope, token } }),
    enabled: open && saved,
    refetchInterval: 30000,
    retry: false,
  });
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoaded(false);
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
        setForm({
          ...initial,
          model: r.bot?.mode === "grade" ? "grid" : c.recovery?.enabled ? "recovery" : "dca",
          capital: c.allocationBnb ?? c.maxExposureQuote ?? 0,
          buyAmount: c.sizingMode === "fixo" ? (c.buyAmount ?? 0) : 0,
          dropPct: c.dropPct || c.recovery?.minDropPct || 5,
          maxEntries: c.maxEntries ?? 1,
          cooldownMin: c.cooldownMin ?? 60,
          maxTradesPerDay: c.maxTradesPerDay || 3,
          profitPct: tp ? Math.max(0, ((1 + tp / 100) * taxRetention - 1) * 100) : 4,
          stopPct: c.stopLossPct ?? 8,
          reserve: c.gasReserveBnb ?? 0.0001,
          buyTax: c.buyTaxPct ?? 0,
          sellTax: c.sellTaxPct ?? 0,
          taxConfirmed: c.taxVerified === true,
          lower: Number(r.bot?.lower_price ?? 0),
          upper: Number(r.bot?.upper_price ?? 0),
          levels: r.bot?.levels ?? 5,
          reboundPct: c.recovery?.reboundPct ?? 1,
          maxReboundPct: c.recovery?.maxReboundPct ?? 3,
          confirmationBars: c.recovery?.confirmationBars ?? 2,
        });
        setVersion(r.strategy?.version ?? 0);
        setRevision(r.draft?.revision ?? 0);
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
    };
  }, [open, walletScope, token]);
  const set = <K extends keyof GuidedForm>(k: K, v: GuidedForm[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setSaved(false);
    setAck(false);
  };
  const validation = guidedInputSchema.safeParse(form);
  const issue = validation.success
    ? ""
    : (validation.error.issues[0]?.message ?? "Revise os campos.");
  const unsupported = incompatibleBotToken(token);
  const compatible = market.data?.pools.some((p) => p.supported && Number(p.priceUsd) > 0);
  const amount = (n: number) => (currency === "BRL" && rate ? Number((n * rate).toFixed(2)) : n);
  const fromInput = (n: number) => (currency === "BRL" && rate ? n / rate : n);
  const quote = (n: number) =>
    `${n.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} BNB${rate ? ` (≈ ${(n * rate).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})` : ""}`;
  const createWallet = async () => {
    setBusy(true);
    try {
      await createBotWallet({ data: { walletScope } });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!validation.success) return setError(issue);
    setBusy(true);
    setError("");
    try {
      await saveGuidedBot({
        data: { walletScope, token, settings: validation.data, version, draftRevision: revision },
      });
      setVersion((v) => v + 1);
      setRevision(0);
      setSaved(true);
      await qc.invalidateQueries({ queryKey: ["bot-readiness", walletScope, token] });
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (
          !busy &&
          (!v && loaded && !saved ? window.confirm("Fechar sem salvar estas alterações?") : true)
        )
          onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto p-4 sm:p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Configurar robô · {symbol}</DialogTitle>
          <DialogDescription>
            Carteira {walletName}. Você paga com BNB e recebe {symbol}. Toda a preparação acontece
            aqui.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid grid-cols-4 gap-1 text-center text-xs" aria-label="Etapas">
          {["Modelo", "Valores", "Regras", "Revisar"].map((s, i) => (
            <li
              key={s}
              aria-current={step === i ? "step" : undefined}
              className={`rounded border p-2 ${step === i ? "border-primary text-primary" : "text-muted-foreground"}`}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>
        {unsupported && (
          <p role="alert" className="rounded border border-warning p-3 text-sm text-warning">
            {INCOMPATIBLE_BNB}
          </p>
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
            {step === 0 && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {walletOptions && onSelectWallet && (
                    <label className="text-sm">
                      Carteira do robô
                      <select
                        aria-label="Carteira do robô"
                        className="mt-1 w-full rounded border border-input bg-background p-3"
                        value={walletScope}
                        onChange={(e) => onSelectWallet(e.target.value)}
                      >
                        {walletOptions.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {tokens && onSelectToken && (
                    <label className="text-sm">
                      Moeda que quero comprar
                      <select
                        aria-label="Moeda que quero comprar"
                        className="mt-1 w-full rounded border border-input bg-background p-3"
                        value={token}
                        onChange={(e) => onSelectToken(e.target.value)}
                      >
                        {tokens.map((t) => (
                          <option key={t.address} value={t.address}>
                            {t.symbol}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Trocar carteira ou moeda abre as regras dela e descarta os campos ainda não salvos
                  deste assistente.
                </p>
                <p className="text-sm">
                  Escolha como o robô vai agir. As porcentagens e os valores serão revisados antes
                  de iniciar.
                </p>
                {(
                  [
                    [
                      "dca",
                      "Comprar em etapas",
                      "Espera a queda definida, compra uma parte e só compra novamente depois de nova queda. Vende a posição pela meta sobre o preço médio.",
                    ],
                    [
                      "grid",
                      "Comprar e vender numa faixa",
                      "Compra ao descer um nível e vende ao subir. A faixa usa BNB por moeda; os custos precisam caber no espaçamento.",
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
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${form.model === id ? "border-primary" : "border-border"}`}
                  >
                    <input
                      type="radio"
                      name="guided-model"
                      value={id}
                      checked={form.model === id}
                      onChange={() => set("model", id)}
                    />
                    <span>
                      <b className="block text-sm">{name}</b>
                      <span className="text-xs text-muted-foreground">{desc}</span>
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
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm">
                  O capital é o teto de compras deste robô. A reserva para taxas fica fora desse
                  valor; outros robôs não podem usar o mesmo saldo duas vezes.
                </p>
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
                    Reais · estimativa
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={`Capital máximo (${currency === "BRL" ? "R$" : "BNB"})`}
                    value={amount(form.capital)}
                    onChange={(n) => set("capital", fromInput(n))}
                  />
                  <NumberField
                    label={`Valor de cada compra (${currency === "BRL" ? "R$" : "BNB"})`}
                    value={amount(form.buyAmount)}
                    onChange={(n) => set("buyAmount", fromInput(n))}
                  />
                  {form.model !== "grid" && form.model !== "recovery" && (
                    <NumberField
                      label="Máximo de compras antes de vender"
                      value={form.maxEntries}
                      onChange={(n) => set("maxEntries", n)}
                    />
                  )}
                  <NumberField
                    label="Reserva para taxas (BNB)"
                    value={form.reserve}
                    onChange={(n) => set("reserve", n)}
                    hint="Reserva de saldo; não é uma taxa cobrada por transação."
                  />
                </div>
                <p className="text-sm">
                  Capital: {quote(form.capital)}. Compra: {quote(form.buyAmount)}.
                </p>
                <div className="rounded border p-3 text-sm">
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
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm">
                  Os valores iniciais são editáveis. As metas não garantem o preço de execução nem
                  lucro após todos os custos.
                </p>
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
                        label="Preço mínimo (BNB por moeda)"
                        value={form.lower}
                        onChange={(n) => set("lower", n)}
                      />
                      <NumberField
                        label="Preço máximo (BNB por moeda)"
                        value={form.upper}
                        onChange={(n) => set("upper", n)}
                      />
                      <NumberField
                        label="Quantidade de intervalos"
                        value={form.levels}
                        onChange={(n) => set("levels", n)}
                      />
                    </>
                  ) : (
                    <NumberField
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
                    label="Vender para proteger após queda de (%)"
                    value={form.stopPct}
                    onChange={(n) => set("stopPct", n)}
                    hint="Queda do preço médio; a perda real pode ser maior por taxas, liquidez e execução."
                  />
                  {form.model === "recovery" && (
                    <>
                      <NumberField
                        label="Recuperação mínima da queda (%)"
                        value={form.reboundPct}
                        onChange={(n) => set("reboundPct", n)}
                      />
                      <NumberField
                        label="Recuperação máxima permitida (%)"
                        value={form.maxReboundPct}
                        onChange={(n) => set("maxReboundPct", n)}
                      />
                      <NumberField
                        label="Fechamentos em alta para confirmar"
                        value={form.confirmationBars}
                        onChange={(n) => set("confirmationBars", n)}
                      />
                    </>
                  )}
                </div>
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
                      label="Taxa na compra (%)"
                      value={form.buyTax}
                      onChange={(n) => set("buyTax", n)}
                    />
                    <NumberField
                      label="Taxa na venda (%)"
                      value={form.sellTax}
                      onChange={(n) => set("sellTax", n)}
                    />
                  </div>
                </details>
                <details className="rounded border p-3 text-sm">
                  <summary className="cursor-pointer">Intervalo e limite diário</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <NumberField
                      label="Intervalo mínimo entre compras (min)"
                      value={form.cooldownMin}
                      onChange={(n) => set("cooldownMin", n)}
                    />
                    <NumberField
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
                    checked={form.taxConfirmed}
                    onChange={(e) => set("taxConfirmed", e.target.checked)}
                  />
                  Conferi os percentuais de taxa desta moeda, incluindo quando forem zero.
                </label>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/40 p-3 text-sm">
                  <p>
                    <b>{symbol}</b> · carteira {walletName} · compra com BNB
                  </p>
                  <p className="mt-2">
                    Pode usar até <b>{quote(form.capital)}</b>, mais {quote(form.reserve)}{" "}
                    reservados para taxas. Cada compra usa até {quote(form.buyAmount)}, respeitando
                    o capital disponível.
                  </p>
                  <p className="mt-2">
                    {form.model === "grid"
                      ? `Faixa de ${form.lower} a ${form.upper} BNB por moeda, em ${form.levels} intervalos. A primeira avaliação apenas registra o nível; nenhuma compra imediata é prometida.`
                      : form.model === "recovery"
                        ? `Espera queda de ${form.dropPct}%, recuperação entre ${form.reboundPct}% e ${form.maxReboundPct}% e ${form.confirmationBars} fechamentos em alta. Apenas uma entrada por fundo.`
                        : `Primeira compra após queda de ${form.dropPct}% da referência de 24h. Até ${form.maxEntries} compras; novas entradas exigem mais queda. Não compra imediatamente ao iniciar.`}
                  </p>
                  <p className="mt-2">
                    Meta de ganho: {form.profitPct}% após taxas do token, antes dos demais custos.
                    Proteção: vender após queda de {form.stopPct}% do preço médio. Pausar não vende
                    a posição.
                  </p>
                  <p className="mt-2 text-xs">
                    As regras guiadas usam velas de 15 minutos e janela de 24 horas. Esperam{" "}
                    {form.cooldownMin} minutos entre compras; novas entradas param após{" "}
                    {form.maxTradesPerDay} operações no dia, preservando as saídas da posição. Ao
                    salvar, substituem as regras anteriores deste robô pausado e sem posição,
                    incluindo parâmetros avançados. O histórico permanece.
                  </p>
                </div>
                {!saved ? (
                  <>
                    <p className="text-sm text-warning">
                      {issue || "Regras prontas para salvar. Isso ainda não inicia operações."}
                    </p>
                    <Button
                      className="w-full"
                      disabled={busy || !validation.success || unsupported}
                      onClick={save}
                    >
                      {busy ? "Salvando…" : "Salvar regras e preparar robô"}
                    </Button>
                  </>
                ) : (
                  <>
                    <BotReadiness
                      walletScope={walletScope}
                      token={token}
                      onConfigure={() => {
                        setSaved(false);
                        setStep(1);
                      }}
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
                      disabled={busy || !ack || !readiness.data?.ready}
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
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  variant="outline"
                  disabled={busy || step === 0}
                  onClick={() => setStep((n) => n - 1)}
                >
                  Voltar
                </Button>
                {step < 3 && (
                  <Button
                    disabled={busy || unsupported || locked || (step === 0 && !compatible)}
                    onClick={() => {
                      if (step === 1 && (!(form.capital > 0) || !(form.buyAmount > 0)))
                        return setError("Informe o capital e o valor por compra.");
                      setError("");
                      setStep((n) => n + 1);
                    }}
                  >
                    Continuar
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
