import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { FiatValue } from "@/hooks/useCurrency";
import { useChartPool } from "@/hooks/useChartPool";
import { useCandles } from "@/hooks/useCandles";
import { getTradingMarket } from "@/lib/chain.functions";
import { getGuidedBotSettings, getBotReadiness, startGuidedBot } from "@/lib/guidedBot.functions";
import { getChartGasReference, saveChartRule } from "@/lib/chartRule.functions";
import { createBotWallet, getBotWallet } from "@/lib/bot.functions";
import { getTokenTax } from "@/lib/userTokens.functions";
import { chartProjection, chartRuleInputSchema, heldChartProjection } from "@/lib/chartRule";
import { hasVerifiedTax, taxFor } from "@/lib/tokens";
import { userMessage, formIssueMessage } from "@/lib/userMessage";
import { formatPrice, formatDistancePct } from "@/lib/display";
import type { StrategyConfig } from "@/lib/strategy";
import { CandleChart, type ChartLevel } from "./CandleChart";
import { FundBotDialog } from "./FundBotDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Props = {
  token: string;
  symbol: string;
  onSaved?: (() => void | Promise<void>) | undefined;
  label?: string;
};
export function ChartRuleLauncher(props: Props) {
  const { user } = useAuth();
  const selection = useSelectedWallet();
  return (
    <Launcher
      key={`${user?.id}:${selection.walletScope}:${props.token.toLowerCase()}`}
      {...props}
      userId={user?.id ?? ""}
      walletScope={selection.walletScope}
      walletName={selection.name}
      sourceAddress={selection.address}
      ready={selection.ready}
    />
  );
}
function Launcher(
  props: Props & {
    userId: string;
    walletScope: string;
    walletName: string;
    sourceAddress: string | null;
    ready: boolean;
  },
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="my-2"
        disabled={!props.userId || !props.ready}
        onClick={() => setOpen(true)}
      >
        {props.label ?? "Criar regra pelo gráfico"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="exchange-workspace max-h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Criar regra pelo gráfico · {props.symbol}</DialogTitle>
            <DialogDescription>
              {props.walletName} · marque preços para uma operação futura. Salvar mantém o robô
              pausado.
            </DialogDescription>
          </DialogHeader>
          {open && <ChartRuleEditor {...props} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
type Form = Record<
  | "entryBnb"
  | "exitBnb"
  | "stopBnb"
  | "amountBnb"
  | "buyTaxPct"
  | "sellTaxPct"
  | "dexFeePct"
  | "executionMarginPct"
  | "gasBuyBnb"
  | "gasSellBnb"
  | "reserveBnb"
  | "maxGasGwei"
  | "minLiquidityUsd"
  | "targetPct",
  string
>;
const draftFields: (keyof Form)[] = [
  "entryBnb",
  "exitBnb",
  "stopBnb",
  "amountBnb",
  "buyTaxPct",
  "sellTaxPct",
  "dexFeePct",
  "executionMarginPct",
  "gasBuyBnb",
  "gasSellBnb",
  "reserveBnb",
  "maxGasGwei",
  "minLiquidityUsd",
  "targetPct",
];
const number = (value: string) => (value.trim() ? Number(value) : NaN);
const bnb = (value: number) => `${formatPrice(value)} BNB`;

export function ChartRuleEditor({
  token,
  symbol,
  walletScope,
  walletName,
  userId,
  sourceAddress,
  onSaved,
  onClose,
}: Props & {
  userId: string;
  walletScope: string;
  walletName: string;
  sourceAddress: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now);
  const [form, setForm] = useState<Form>({
    entryBnb: "",
    exitBnb: "",
    stopBnb: "",
    amountBnb: "",
    buyTaxPct: "",
    sellTaxPct: "",
    dexFeePct: "0.25",
    executionMarginPct: "1",
    gasBuyBnb: "",
    gasSellBnb: "",
    reserveBnb: "0.0001",
    maxGasGwei: "5",
    minLiquidityUsd: "5000",
    targetPct: "3",
  });
  const [pick, setPick] = useState<"entryBnb" | "exitBnb" | "stopBnb" | null>("entryBnb");
  const [stopChoice, setStopChoice] = useState<"price" | "none" | "">("");
  const [taxConfirmed, setTaxConfirmed] = useState(false),
    [costsConfirmed, setCostsConfirmed] = useState(false),
    [acknowledge, setAcknowledge] = useState(false);
  const [review, setReview] = useState(false),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [startAck, setStartAck] = useState(false),
    [started, setStarted] = useState(false);
  const [taxNotice, setTaxNotice] = useState("");
  const initialized = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const draftKey = `cryptobot:chart-rule-draft:${userId}:${walletScope}:${token.toLowerCase()}`;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  const settings = useQuery({
    queryKey: ["chart-rule-settings", userId, walletScope, token],
    queryFn: () => getGuidedBotSettings({ data: { walletScope, token } }),
    staleTime: 0,
    retry: false,
  });
  const gas = useQuery({
    queryKey: ["chart-rule-gas", userId, walletScope, token],
    queryFn: () => getChartGasReference({ data: { walletScope, token } }),
    staleTime: 30000,
    retry: false,
  });
  const wallet = useQuery({
    queryKey: ["chart-rule-wallet", userId, walletScope],
    queryFn: () => getBotWallet({ data: { walletScope } }),
    retry: false,
  });
  const market = useQuery({
    queryKey: ["trading-market", token],
    queryFn: () => getTradingMarket({ data: { address: token } }),
    staleTime: 2000,
    refetchInterval: 3000,
    retry: false,
  });
  const pool = market.data?.pools.find((p) => p.supported);
  const chartPool = useChartPool(token, pool);
  const candles = useCandles(chartPool, token);
  const priceUsd = Number(pool?.priceUsd),
    priceBnb = Number(pool?.priceNative);
  const conversion =
    priceUsd > 0 && priceBnb > 0 && Number.isFinite(priceUsd / priceBnb)
      ? priceUsd / priceBnb
      : null;
  const at = Date.parse(market.data?.fetchedAt ?? "");
  const fresh =
    !market.isError &&
    !market.data?.error &&
    conversion != null &&
    Number.isFinite(at) &&
    now - at <= 15000 &&
    at <= now + 5000;
  const state = settings.data?.bot?.strat_state as
    { tokens?: number; costBnb?: number; accountingEstimated?: boolean } | null | undefined;
  const locked =
    !!settings.data?.bot?.armed ||
    Number(state?.tokens ?? 0) > 0 ||
    Number(state?.costBnb ?? 0) > 0;
  useEffect(() => {
    if (!settings.data || initialized.current) return;
    initialized.current = true;
    const cfg = settings.data.strategy?.config as Partial<StrategyConfig> | undefined;
    const tax = hasVerifiedTax(token, cfg) ? taxFor(token, cfg) : null;
    let restored: Partial<Form> = {};
    try {
      const raw = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (
        raw?.version === (settings.data.strategy?.version ?? 0) &&
        raw?.revision === (settings.data.draft?.revision ?? 0) &&
        raw?.form &&
        typeof raw.form === "object"
      )
        restored = Object.fromEntries(
          draftFields.flatMap((key) =>
            typeof raw.form[key] === "string" ? [[key, raw.form[key]]] : [],
          ),
        );
    } catch {
      /* Draft storage is optional; never authorize or restore confirmations. */
    }
    setForm((p) => ({
      ...p,
      entryBnb: cfg?.chartRule ? String(cfg.chartRule.entryBnb) : p.entryBnb,
      exitBnb: cfg?.chartRule ? String(cfg.chartRule.exitBnb) : p.exitBnb,
      stopBnb: cfg?.chartRule?.stopBnb != null ? String(cfg.chartRule.stopBnb) : p.stopBnb,
      amountBnb: cfg?.sizingMode === "fixo" && cfg.buyAmount ? String(cfg.buyAmount) : p.amountBnb,
      buyTaxPct: tax ? String(tax.buy) : p.buyTaxPct,
      sellTaxPct: tax ? String(tax.sell) : p.sellTaxPct,
      reserveBnb: String(cfg?.gasReserveBnb ?? 0.0001),
      maxGasGwei: String(cfg?.maxGasGwei ?? 5),
      minLiquidityUsd: String(cfg?.minLiquidityUsd ?? 5000),
      ...restored,
      dexFeePct: "0.25",
    }));
    setDraftReady(true);
    setTaxNotice(
      tax
        ? "Taxas de referência carregadas. Confira e confirme antes de salvar."
        : "Taxas não confirmadas. Consulte ou informe as taxas de compra e venda; desconhecido não significa zero.",
    );
  }, [settings.data, token, draftKey]);
  useEffect(() => {
    if (!draftReady || saved || started || !settings.data) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          form,
          version: settings.data.strategy?.version ?? 0,
          revision: settings.data.draft?.revision ?? 0,
        }),
      );
    } catch {
      /* Optional browser storage. */
    }
  }, [draftReady, saved, started, settings.data, draftKey, form]);
  useEffect(() => {
    if (gas.data)
      setForm((p) => ({
        ...p,
        gasBuyBnb: p.gasBuyBnb || gas.data.gasBuyBnb,
        gasSellBnb: p.gasSellBnb || gas.data.gasSellBnb,
      }));
  }, [gas.data]);
  const change = (key: keyof Form, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    setSaved(false);
    setReview(false);
    setAcknowledge(false);
    setStartAck(false);
    if (["buyTaxPct", "sellTaxPct"].includes(key)) setTaxConfirmed(false);
    if (["dexFeePct", "executionMarginPct", "gasBuyBnb", "gasSellBnb"].includes(key))
      setCostsConfirmed(false);
  };
  const c = {
    entryBnb: number(form.entryBnb),
    amountBnb: number(form.amountBnb),
    buyTaxPct: number(form.buyTaxPct),
    sellTaxPct: number(form.sellTaxPct),
    dexFeePct: number(form.dexFeePct),
    executionMarginPct: number(form.executionMarginPct),
    gasBuyBnb: number(form.gasBuyBnb),
    gasSellBnb: number(form.gasSellBnb),
  };
  const exit = number(form.exitBnb),
    target = number(form.targetPct);
  const projection = chartProjection(c, exit > 0 ? exit : c.entryBnb, target);
  // Partial references deliberately exclude gas/amount; do not pass unknown gas
  // as zero to the full monetary projection or enable saving with partial data.
  const feeOnly = chartProjection(
    { ...c, amountBnb: 1, gasBuyBnb: 0, gasSellBnb: 0 },
    c.entryBnb,
    target,
  );
  const referenceLevels = projection ?? feeOnly;
  const held =
    state && Number(state.tokens) > 0
      ? heldChartProjection(
          Number(state.tokens),
          Number(state.costBnb),
          exit,
          c.sellTaxPct,
          c.dexFeePct,
          c.executionMarginPct,
          c.gasSellBnb,
        )
      : null;
  const levels: ChartLevel[] =
    conversion == null
      ? []
      : [
          ...(c.entryBnb > 0
            ? [
                {
                  id: "entryBnb",
                  price: c.entryBnb * conversion,
                  label: "Entrada",
                  tone: "buy" as const,
                  draggable: true,
                },
              ]
            : []),
          ...(exit > 0
            ? [
                {
                  id: "exitBnb",
                  price: exit * conversion,
                  label: "Saída",
                  tone: "target" as const,
                  draggable: true,
                },
              ]
            : []),
          ...(stopChoice === "price" && number(form.stopBnb) > 0
            ? [
                {
                  id: "stopBnb",
                  price: number(form.stopBnb) * conversion,
                  label: "Stop",
                  tone: "stop" as const,
                  draggable: true,
                },
              ]
            : []),
          ...(referenceLevels
            ? [
                {
                  price: referenceLevels.breakEvenBnb * conversion,
                  label: projection ? "Equilíbrio estimado" : "Equilíbrio parcial · sem gás",
                  tone: "avg" as const,
                },
                {
                  price: referenceLevels.targetBnb * conversion,
                  label: `${projection ? "Meta estimada" : "Meta parcial · sem gás"} ${formatDistancePct(target)}`,
                  tone: "target" as const,
                },
              ]
            : []),
        ];
  const selectPoint = (key: "entryBnb" | "exitBnb" | "stopBnb", usd: number) => {
    if (!fresh || conversion == null)
      return setError("Atualize a cotação em BNB antes de marcar ou arrastar um ponto.");
    change(key, String(usd / conversion));
    setError("");
  };
  const input = chartRuleInputSchema.safeParse({
    ...c,
    exitBnb: exit,
    stopBnb: stopChoice === "price" ? number(form.stopBnb) : null,
    stopChoice,
    taxesConfirmed: taxConfirmed,
    costsConfirmed,
    reserveBnb: number(form.reserveBnb),
    maxGasGwei: number(form.maxGasGwei),
    minLiquidityUsd: number(form.minLiquidityUsd),
    acknowledge,
  });
  const readiness = useQuery({
    queryKey: ["chart-rule-readiness", userId, walletScope, token],
    queryFn: () => getBotReadiness({ data: { walletScope, token } }),
    enabled: saved && !started,
    retry: false,
  });
  const field = (key: keyof Form, label: string) => (
    <label key={key} className="block text-sm">
      <span className="mb-1 block">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={form[key]}
        disabled={busy || started}
        readOnly={key === "dexFeePct"}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const refreshAfterSave = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["wallet-capital", walletScope] }),
      queryClient.invalidateQueries({ queryKey: ["wallet-funds"] }),
    ]);
    await onSaved?.();
  };
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-secondary p-3 text-sm">
        1. Marque a entrada. 2. Confira os custos e escolha a saída. 3. Escolha o stop e revise.
        Arraste os marcadores ↕ ou ajuste os valores. Arrastar o fundo move o histórico; clicar numa
        vela antiga usa seu preço como referência para uma regra futura.
      </p>
      {settings.isPending && <p role="status">Carregando as regras desta carteira…</p>}
      {settings.isError && (
        <p role="alert">
          Não foi possível carregar as regras.{" "}
          <Button variant="outline" onClick={() => void settings.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {locked && (
        <p role="status" className="text-sm text-warning">
          Há um robô ligado ou uma posição aberta nesta carteira e token. Você pode estudar os
          pontos; substituir as regras exige pausar e encerrar a posição. Nenhuma regra existente
          será alterada aqui enquanto isso.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["entryBnb", "Marcar entrada"],
            ["exitBnb", "Marcar saída"],
            ...(stopChoice === "price" ? [["stopBnb", "Marcar stop"]] : []),
          ] as ["entryBnb" | "exitBnb" | "stopBnb", string][]
        ).map(([key, text]) => (
          <Button
            key={key}
            variant={pick === key ? "default" : "outline"}
            disabled={busy || started || !fresh}
            onClick={() => setPick(key)}
          >
            {text}
          </Button>
        ))}
        <Button variant="outline" onClick={() => setPick(null)}>
          Mover e inspecionar
        </Button>
        <Button
          variant="outline"
          disabled={busy || started}
          onClick={() => {
            setForm((previous) => ({ ...previous, entryBnb: "", exitBnb: "", stopBnb: "" }));
            setStopChoice("");
            setPick("entryBnb");
            setReview(false);
            setSaved(false);
            setAcknowledge(false);
            setStartAck(false);
            setError("");
          }}
        >
          Limpar pontos do rascunho
        </Button>
        <Button
          variant="outline"
          disabled={market.isFetching}
          onClick={() => void market.refetch()}
        >
          Atualizar cotação
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {fresh
          ? `Cotação atual de ${symbol}: ${bnb(priceBnb)} por token.`
          : "Cotação em BNB indisponível ou antiga: marcação por clique e salvamento aguardam atualização."}{" "}
        Os níveis são fixados em BNB/token; a altura em dólares acompanha a conversão do BNB.
      </p>
      <CandleChart
        candles={candles.data ?? []}
        history={candles.history}
        now={now}
        levels={levels}
        preferenceKey="cryptobot:chart-rule-view"
        pickingPrice={pick != null && fresh && !busy && !started}
        onPickPrice={(p) => {
          if (pick) {
            selectPoint(pick, p.price);
            setPick(pick === "entryBnb" ? "exitBnb" : null);
          }
        }}
        onEditLevel={
          !busy && !started && fresh
            ? (id, price) => {
                if (["entryBnb", "exitBnb", "stopBnb"].includes(id))
                  selectPoint(id as "entryBnb" | "exitBnb" | "stopBnb", price);
              }
            : undefined
        }
        liveQuote={fresh ? { price: priceUsd, at } : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {field("entryBnb", "Entrada (BNB por token)")}
        {field("exitBnb", "Saída (BNB por token)")}
        {field("amountBnb", "Valor da única compra (BNB)")}
      </div>
      {fresh && c.entryBnb > 0 && (
        <p className="text-sm">
          Entrada {formatDistancePct(Math.abs((1 - c.entryBnb / priceBnb) * 100))}{" "}
          {c.entryBnb <= priceBnb ? "abaixo" : "acima"} do preço atual.
          {c.entryBnb >= priceBnb &&
            " Ao iniciar, a condição de compra já poderá estar satisfeita."}
        </p>
      )}
      <fieldset className="space-y-3 rounded-xl border p-3">
        <legend className="px-1 font-semibold">Taxas e custos estimados</legend>
        <p className="text-xs text-muted-foreground">
          {taxNotice} As taxas podem mudar. A consulta de taxas é uma simulação, sem envio de
          transações.
        </p>
        <Button
          variant="outline"
          disabled={busy || started}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await getTokenTax({ data: { address: token } });
              if (!mounted.current) return;
              if (!r.tax) throw new Error(r.error ?? "Não foi possível consultar as taxas.");
              change("buyTaxPct", String(r.tax.buy));
              change("sellTaxPct", String(r.tax.sell));
              setTaxNotice("Taxas simuladas. Confira os valores e confirme abaixo.");
            } catch (e) {
              if (mounted.current) setError(userMessage(e));
            } finally {
              if (mounted.current) setBusy(false);
            }
          }}
        >
          Consultar taxas do token
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("buyTaxPct", "Taxa do token na compra (%)")}
          {field("sellTaxPct", "Taxa do token na venda (%)")}
          {field("dexFeePct", "Taxa da DEX por operação (%)")}
          {field("executionMarginPct", "Margem/slippage por operação (%)")}
          {field("gasBuyBnb", "Gás estimado da compra (BNB)")}
          {field("gasSellBnb", "Gás estimado de aprovação e venda (BNB)")}
        </div>
        <p className="text-xs text-muted-foreground">
          DEX: referência de 0,25% por operação na PancakeSwap V2. Margem descontada nas duas
          operações. Impacto de preço adicional, taxas variáveis e gás real podem mudar o resultado.{" "}
          {gas.data
            ? `Gás de referência às ${new Date(gas.data.at).toLocaleTimeString("pt-BR")}: ${gas.data.buyUnits.toLocaleString("pt-BR")} unidades na compra e ${gas.data.sellUnits.toLocaleString("pt-BR")} na aprovação/venda, ao preço atual do gás; não é simulação de uma venda bem-sucedida. Edite se necessário.`
            : "Gás não apurado: preencha as estimativas ou tente consultar novamente."}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || gas.isFetching || started}
          onClick={async () => {
            const r = await gas.refetch();
            if (r.data && mounted.current) {
              change("gasBuyBnb", r.data.gasBuyBnb);
              change("gasSellBnb", r.data.gasSellBnb);
            }
          }}
        >
          Consultar referência de gás
        </Button>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={taxConfirmed}
            disabled={busy || started}
            onChange={(e) => {
              setTaxConfirmed(e.target.checked);
              setSaved(false);
              setReview(false);
            }}
          />
          Conferi as taxas de compra e venda; zero foi informado explicitamente quando aplicável.
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={costsConfirmed}
            disabled={busy || started}
            onChange={(e) => {
              setCostsConfirmed(e.target.checked);
              setSaved(false);
              setReview(false);
            }}
          />
          Revisei a taxa da DEX, a margem e as estimativas de gás.
        </label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("targetPct", "Minha meta líquida estimada (%)")}
        <Button
          className="self-end"
          variant="outline"
          disabled={!projection || busy || started || !(target >= 0)}
          onClick={() => {
            if (projection) change("exitBnb", String(projection.targetBnb));
          }}
        >
          Usar saída calculada para minha meta
        </Button>
      </div>
      {!projection && feeOnly && (
        <p className="text-sm">
          Referência parcial somente com taxas e margem: equilíbrio em {bnb(feeOnly.breakEvenBnb)}{" "}
          por token. Ainda falta incluir o valor da compra e o gás; as linhas parciais não são uma
          projeção de lucro líquido.
        </p>
      )}
      {projection ? (
        <dl className="grid gap-3 rounded-xl bg-secondary p-3 text-sm sm:grid-cols-2">
          <div>
            <dt>Equilíbrio estimado após custos</dt>
            <dd className="font-semibold">{bnb(projection.breakEvenBnb)} por token</dd>
          </div>
          <div>
            <dt>Saída para minha meta</dt>
            <dd className="font-semibold">{bnb(projection.targetBnb)} por token</dd>
          </div>
          {exit > 0 && (
            <>
              <div>
                <dt>Alta entre entrada e saída</dt>
                <dd>{formatDistancePct(projection.risePct)}</dd>
              </div>
              <div>
                <dt>Recebimento estimado após venda e gás</dt>
                <dd>
                  {bnb(projection.receivedBnb)}
                  <FiatValue bnb={projection.receivedBnb} />
                </dd>
              </div>
              <div>
                <dt>Lucro ou prejuízo líquido estimado</dt>
                <dd className={projection.profitBnb > 0 ? "text-success" : "text-destructive"}>
                  {bnb(projection.profitBnb)} · {formatDistancePct(projection.netPct)}
                  <FiatValue bnb={projection.profitBnb} />
                </dd>
              </div>
            </>
          )}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Preencha entrada, valor da compra, taxas e gás para calcular equilíbrio e saídas. Dados
          desconhecidos não são considerados zero.
        </p>
      )}
      {held && (
        <p className="rounded-xl border p-3 text-sm">
          Posição atual do robô:{" "}
          {Number(state?.tokens).toLocaleString("pt-BR", { maximumSignificantDigits: 8 })} {symbol};
          custo gerenciado {bnb(Number(state?.costBnb))}
          {state?.accountingEstimated ? " (estimado)" : ""}. Na saída marcada: resultado estimado{" "}
          {bnb(held.profitBnb)} ({formatDistancePct(held.netPct)}). Usa a quantidade já recebida,
          sem descontar novamente a taxa de compra ou o gás já registrado.
        </p>
      )}
      <fieldset className="space-y-3 rounded-xl border p-3">
        <legend className="px-1 font-semibold">Deseja manter stop-loss?</legend>
        <label className="flex gap-2 text-sm">
          <input
            type="radio"
            name="chart-stop"
            disabled={busy || started}
            checked={stopChoice === "price"}
            onChange={() => {
              setStopChoice("price");
              setPick("stopBnb");
              setSaved(false);
              setReview(false);
              setAcknowledge(false);
            }}
          />
          Sim, marcar um stop abaixo da entrada.
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="radio"
            name="chart-stop"
            disabled={busy || started}
            checked={stopChoice === "none"}
            onChange={() => {
              setStopChoice("none");
              change("stopBnb", "");
              setPick(null);
            }}
          />
          Manter os tokens sem stop fixo.
        </label>
        {stopChoice === "price" && field("stopBnb", "Stop (BNB por token)")}
        <p className="text-xs text-muted-foreground">
          O stop pode vender com prejuízo; custos e execução podem aumentar a perda. Sem stop, o
          token pode continuar caindo até perder todo o valor. Nenhuma opção garante recuperação.
        </p>
        {stopChoice === "price" &&
          number(form.stopBnb) > 0 &&
          chartProjection(c, number(form.stopBnb)) && (
            <p className="text-sm text-warning">
              Resultado estimado no stop: {bnb(chartProjection(c, number(form.stopBnb))!.profitBnb)}{" "}
              ({formatDistancePct(chartProjection(c, number(form.stopBnb))!.netPct)}).
            </p>
          )}
      </fieldset>
      <details className="border-b py-3">
        <summary className="cursor-pointer text-sm font-semibold">Limites e fórmulas</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            {field("reserveBnb", "Reserva de gás (BNB)")}
            {field("maxGasGwei", "Teto de gás (gwei)")}
            {field("minLiquidityUsd", "Liquidez mínima (US$)")}
          </div>
          <p>
            Quantidade estimada = compra ÷ entrada × (1 − taxa de compra) × (1 − taxa DEX) × (1 −
            margem). Recebimento estimado = quantidade × saída × (1 − taxa de venda) × (1 − taxa
            DEX) × (1 − margem) − gás da venda.
          </p>
          <p>
            Resultado = recebimento − compra − gás da compra. Equilíbrio e meta resolvem a mesma
            fórmula para o preço de saída. Uma única entrada por regra; depois da venda, criar outra
            regra exige nova revisão.
          </p>
        </div>
      </details>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          disabled={busy || started}
          checked={acknowledge}
          onChange={(e) => {
            setAcknowledge(e.target.checked);
            setSaved(false);
            setReview(false);
          }}
        />
        Revisei carteira, token, pontos e stop. Entendo que preços são gatilhos, a verificação leva
        tempo e as projeções não garantem execução nem rentabilidade.
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!saved && (
        <Button
          disabled={busy || locked || settings.isPending || settings.isError || !fresh || started}
          onClick={() => {
            if (!input.success) {
              const issue = input.error.issues[0]!;
              const requiredChoices: Record<string, string> = {
                stopChoice: "Escolha explicitamente usar stop ou manter os tokens sem stop fixo.",
                taxesConfirmed: "Confira e confirme as taxas de compra e venda.",
                costsConfirmed:
                  "Revise e confirme a taxa da DEX, a margem e as estimativas de gás.",
                acknowledge:
                  "Confirme a revisão da carteira, token, pontos e stop antes de continuar.",
              };
              if (requiredChoices[String(issue.path[0])])
                return setError(requiredChoices[String(issue.path[0])]!);
              return setError(
                formIssueMessage(
                  issue,
                  issue.path[0] === "stopChoice"
                    ? "Escolha do stop"
                    : "Revise os pontos, custos e confirmações",
                ),
              );
            }
            if (!projection || !(projection.profitBnb > 0))
              return setError(
                "A saída marcada não cobre os custos estimados. Ajuste a saída ou revise os custos antes de salvar.",
              );
            setError("");
            setReview(true);
            setPick(null);
          }}
        >
          Revisar regra gráfica
        </Button>
      )}
      {review && !saved && (
        <section className="space-y-3 rounded-xl border p-4" aria-label="Revisão da regra gráfica">
          <h3 className="font-semibold">
            Revisão · {walletName} · {symbol}
          </h3>
          <p className="text-sm">
            Uma compra de {form.amountBnb} BNB quando o preço for igual ou inferior a{" "}
            {form.entryBnb} BNB/token. Venda total a partir de {form.exitBnb} BNB/token.{" "}
            {stopChoice === "none" ? "Sem stop fixo." : `Stop em ${form.stopBnb} BNB/token.`} Sem
            recompra automática após a saída.
          </p>
          <p className="text-xs text-muted-foreground">
            Salvar cria ou substitui somente as regras deste token e desta carteira, com o robô
            pausado. Posições, histórico e outras carteiras são preservados.
          </p>
          <Button
            disabled={busy || !input.success || locked || !fresh}
            onClick={async () => {
              if (!input.success || !settings.data) return;
              setBusy(true);
              try {
                await saveChartRule({
                  data: {
                    walletScope,
                    token,
                    settings: input.data,
                    version: settings.data.strategy?.version ?? 0,
                    draftRevision: settings.data.draft?.revision ?? 0,
                  },
                });
                if (!mounted.current) return;
                setSaved(true);
                setReview(false);
                try {
                  localStorage.removeItem(draftKey);
                } catch {
                  /* Optional draft. */
                }
                await settings.refetch();
                await refreshAfterSave();
              } catch (e) {
                if (mounted.current) setError(userMessage(e));
              } finally {
                if (mounted.current) setBusy(false);
              }
            }}
          >
            Salvar regra · manter pausado
          </Button>
        </section>
      )}
      {saved && (
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="font-semibold">
            {started ? "Robô iniciado com a regra revisada" : "Regra salva · robô pausado"}
          </h3>
          <p className="text-sm">
            Iniciar é uma etapa separada. Verificações programadas ~2 segundos, mais consultas,
            aprovação e rede. O preço final pode ser diferente.
          </p>
          {!wallet.data?.address && (
            <Button
              variant="outline"
              disabled={busy || wallet.isPending || wallet.isError}
              onClick={async () => {
                setBusy(true);
                try {
                  await createBotWallet({ data: { walletScope } });
                  if (mounted.current) {
                    await wallet.refetch();
                    await readiness.refetch();
                    await onSaved?.();
                  }
                } catch (e) {
                  if (mounted.current) setError(userMessage(e));
                } finally {
                  if (mounted.current) setBusy(false);
                }
              }}
            >
              Criar carteira automática deste grupo
            </Button>
          )}
          {wallet.data?.address && (
            <>
              <p className="break-all text-xs">
                Carteira automática de {walletName}: {wallet.data.address}
              </p>
              <FundBotDialog
                botAddress={wallet.data.address}
                sourceAddress={sourceAddress}
                onDone={() => {
                  void wallet.refetch();
                  void readiness.refetch();
                }}
              />
            </>
          )}
          {readiness.data?.errors.map((message, i) => (
            <p key={i} className="text-sm text-warning">
              {userMessage(message)}
            </p>
          ))}
          <Button
            variant="outline"
            disabled={busy || readiness.isFetching || started}
            onClick={() => void readiness.refetch()}
          >
            Conferir saldo, mercado e custos
          </Button>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={startAck}
              disabled={busy || started}
              onChange={(e) => setStartAck(e.target.checked)}
            />
            Autorizo iniciar somente este robô com os níveis e o stop revisados.
          </label>
          <Button
            disabled={
              busy || !startAck || !readiness.data?.ready || readiness.isFetching || started
            }
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
                  void readiness.refetch();
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
