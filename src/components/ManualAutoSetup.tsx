import { getWalletCapital } from "@/lib/capital.functions";
import { fiatEstimate, formatFiat, type FiatCurrency } from "@/lib/fiat";
import { useEffect, useId, useRef, useState } from "react";
import { useCurrency } from "@/hooks/currencyContext";
import { useQuery } from "@tanstack/react-query";
import { getGuidedBotSettings, getBotReadiness, startGuidedBot } from "@/lib/guidedBot.functions";
import { getFxQuote } from "@/lib/fx.functions";
import { taxFor, hasVerifiedTax } from "@/lib/tokens";
import { saveManualAuto } from "@/lib/manualAuto.functions";
import { manualAutoInputSchema, type ManualAutoInput } from "@/lib/manualAuto";
import { userMessage } from "@/lib/userMessage";
import { getBotWallet, createBotWallet } from "@/lib/bot.functions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
function ValueField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        className="mt-1"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
const number = (v: string) => Number(v.replace(",", "."));
export function ManualAutoSetup({
  userId,
  walletScope,
  token,
  symbol,
  onDone,
}: {
  userId: string;
  walletScope: string;
  token: string;
  symbol: string;
  onDone: () => Promise<void>;
}) {
  const { currency } = useCurrency();
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(""),
    [amountUnit, setAmountUnit] = useState<string>(currency);
  const [entryMode, setEntryMode] = useState<"price" | "percent">("price"),
    [entry, setEntry] = useState("");
  const [exitMode, setExitMode] = useState<"price" | "percent">("price"),
    [exit, setExit] = useState("");
  const [priceUnit, setPriceUnit] = useState<string>(currency),
    [stopChoice, setStopChoice] = useState<boolean | null>(null),
    [stop, setStop] = useState("");
  const [slippage, setSlippage] = useState("1"),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [plan, setPlan] = useState<ManualAutoInput | null>(null),
    [savedEntry, setSavedEntry] = useState<number | null>(null);
  const key = `manual-auto:${userId}:${walletScope}:${token.toLowerCase()}`;
  const [buyTax, setBuyTax] = useState(String(taxFor(token).buy)),
    [sellTax, setSellTax] = useState(String(taxFor(token).sell));
  const hydrated = useRef(false);
  useEffect(() => {
    hydrated.current = false;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const d = JSON.parse(raw);
        setAmount(d.amount ?? "");
        setAmountUnit(d.amountUnit ?? currency);
        setEntryMode(d.entryMode ?? "price");
        setEntry(d.entry ?? "");
        setExitMode(d.exitMode ?? "price");
        setExit(d.exit ?? "");
        setPriceUnit(d.priceUnit ?? currency);
        setStopChoice(d.stopChoice ?? null);
        setStop(d.stop ?? "");
        setSlippage(d.slippage ?? "1");
        setBuyTax(d.buyTax ?? String(taxFor(token).buy));
        setSellTax(d.sellTax ?? String(taxFor(token).sell));
      }
    } catch {
      /* Keep editable fields. */
    }
    hydrated.current = true;
  }, [key, currency, token]);
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          amount,
          amountUnit,
          entryMode,
          entry,
          exitMode,
          exit,
          priceUnit,
          stopChoice,
          stop,
          slippage,
          buyTax,
          sellTax,
        }),
      );
    } catch {
      /* Keep fields in memory. */
    }
  }, [
    key,
    amount,
    amountUnit,
    entryMode,
    entry,
    exitMode,
    exit,
    priceUnit,
    stopChoice,
    stop,
    slippage,
    buyTax,
    sellTax,
  ]);
  const settings = useQuery({
    queryKey: ["manual-auto-settings", userId, walletScope, token],
    queryFn: () => getGuidedBotSettings({ data: { walletScope, token } }),
    enabled: open,
    staleTime: 0,
  });
  const capital = useQuery({
    queryKey: ["manual-auto-capital", userId, walletScope],
    queryFn: () => getWalletCapital({ data: { walletScope } }),
    enabled: open,
    staleTime: 0,
    refetchInterval: open ? 15000 : false,
    retry: false,
  });
  const readiness = useQuery({
    queryKey: ["manual-auto-readiness", userId, walletScope, token, saved],
    queryFn: () => getBotReadiness({ data: { walletScope, token } }),
    enabled: open && saved,
    staleTime: 0,
    retry: false,
  });
  const fx = useQuery({
    queryKey: ["manual-auto-fx"],
    queryFn: () => getFxQuote(),
    enabled: open,
    staleTime: 30000,
    refetchInterval: open ? 60000 : false,
  });
  const wallet = useQuery({
    queryKey: ["manual-auto-wallet", userId, walletScope],
    queryFn: () => getBotWallet({ data: { walletScope } }),
    enabled: open,
    staleTime: 0,
  });
  const usdRate = (unit: string) =>
    unit === "USD" ? 1 : unit === "BRL" ? fx.data?.usdBrl : unit === "EUR" ? fx.data?.usdEur : null;
  const convertUsd = (v: number, unit: string) => {
    if (unit !== "USD" && fx.data && Date.now() - fx.data.at > 180000)
      throw new Error("A conversão ficou antiga. Atualize ou escolha USD/BNB.");
    const rate = usdRate(unit);
    if (!(rate && rate > 0))
      throw new Error(
        "Conversão indisponível. Escolha USD para os preços ou BNB para o valor aplicado, ou tente novamente.",
      );
    return v / rate;
  };
  const capitalFresh =
    !!capital.data && !capital.isError && Date.now() - Date.parse(capital.data.at) < 30000;
  const freeBnb = capitalFresh ? capital.data!.free : null;
  const displayBalance = (raw: string | null | undefined) => {
    if (raw == null) return "Não apurado";
    if (amountUnit === "BNB")
      return `${Number(raw).toLocaleString("pt-BR", { maximumFractionDigits: 10 })} BNB`;
    const rates = !fx.isError && fx.data && Date.now() - fx.data.at < 180000 ? fx.data : null;
    const value = fiatEstimate(raw, "BNB", amountUnit as FiatCurrency, rates);
    return value == null
      ? "Conversão indisponível"
      : `≈ ${formatFiat(value, amountUnit as FiatCurrency)}`;
  };
  const advance = () => {
    setError("");
    try {
      if (step === 0 && !(number(amount) > 0)) throw new Error("Informe quanto quer aplicar.");
      if (step === 1 && (!(number(entry) > 0) || (entryMode === "percent" && number(entry) >= 100)))
        throw new Error("Informe um preço positivo ou queda entre 0 e 100%.");
      if (
        step === 2 &&
        (!Number.isFinite(number(exit)) ||
          exit.trim() === "" ||
          (exitMode === "price" ? number(exit) <= 0 : number(exit) <= -100))
      )
        throw new Error("Informe um preço de saída positivo ou percentual maior que -100%.");
      if (step === 3) {
        if (stopChoice === null) throw new Error("Escolha se deseja stop loss.");
        if (stopChoice && (!(number(stop) > 0) || number(stop) >= 100))
          throw new Error("Informe um stop entre 0 e 100%.");
        const bnb =
          amountUnit === "BNB"
            ? number(amount)
            : convertUsd(number(amount), amountUnit) / (fx.data?.bnbUsd || 0);
        setPlan(
          manualAutoInputSchema.parse({
            buyTaxPct: number(buyTax),
            sellTaxPct: number(sellTax),
            capitalBnb: bnb,
            entryMode,
            entryValue:
              entryMode === "price" ? convertUsd(number(entry), priceUnit) : number(entry),
            exitMode,
            exitValue: exitMode === "price" ? convertUsd(number(exit), priceUnit) : number(exit),
            stopLossPct: stopChoice ? number(stop) : null,
            slippagePct: number(slippage),
          }),
        );
      }
      setStep((s) => s + 1);
    } catch (e) {
      setError(
        e instanceof Error && !e.message.startsWith("[")
          ? e.message
          : "Confira os valores e a conversão antes de continuar.",
      );
    }
  };
  const save = async () => {
    if (!plan || !settings.data) return;
    setBusy(true);
    setError("");
    try {
      if (!wallet.data?.address) await createBotWallet({ data: { walletScope } });
      const result = await saveManualAuto({
        data: {
          walletScope,
          token,
          settings: plan,
          version: settings.data.strategy?.version ?? 0,
          draftRevision: settings.data.draft?.revision ?? 0,
        },
      });
      setSavedEntry(result.entryUsd);
      setSaved(true);
      await onDone();
      try {
        localStorage.removeItem(key);
      } catch {
        /* Saved on the server. */
      }
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await startGuidedBot({ data: { walletScope, token, confirmation: "INICIAR ROBÔ" } });
      await onDone();
      setOpen(false);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="default"
        className="h-auto min-h-12 w-full max-w-full whitespace-normal px-4 py-3 text-base font-semibold"
        onClick={() => {
          setOpen(true);
          setSaved(false);
          setStep(0);
          setError("");
        }}
      >
        Manual automático · configuração simples
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manual automático · {symbol}</DialogTitle>
            <DialogDescription>
              Você escolhe os pontos. O robô faz uma compra e uma venda, sem indicadores ou lucro
              mínimo obrigatório.
            </DialogDescription>
          </DialogHeader>
          {!saved ? (
            <>
              <p className="text-xs text-muted-foreground">
                Etapa {step + 1} de 5 ·{" "}
                {["Valor aplicado", "Entrada", "Saída", "Stop loss", "Revisão"][step]}
              </p>
              {step === 0 && (
                <div className="space-y-3">
                  <section
                    aria-label="Saldo disponível para investir"
                    className="space-y-3 rounded-xl border-2 border-primary/40 bg-primary/10 p-4"
                  >
                    <p className="text-sm font-semibold">Saldo disponível para investir</p>
                    <p className="break-words text-3xl font-bold tabular-nums" role="status">
                      {freeBnb != null
                        ? displayBalance(freeBnb)
                        : capital.isError
                          ? "Saldo indisponível"
                          : capital.data === null
                            ? "Carteira automática ainda não criada"
                            : "Consultando saldo…"}
                    </p>
                    {freeBnb != null && amountUnit !== "BNB" && (
                      <p className="break-words text-sm tabular-nums">
                        {Number(freeBnb).toLocaleString("pt-BR", { maximumFractionDigits: 10 })} BNB
                        livres
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Antes do gás desta compra, pago em BNB.
                    </p>
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium">
                        Ver saldo total, reservas e gás
                      </summary>
                      {capitalFresh && (
                        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <dt>Saldo total na carteira</dt>
                            <dd className="font-medium">{displayBalance(capital.data!.balance)}</dd>
                          </div>
                          <div>
                            <dt>Reservado para compras dos robôs ativos</dt>
                            <dd className="font-medium">
                              {displayBalance(capital.data!.reserved)}
                            </dd>
                          </div>
                          <div>
                            <dt>Gás já reservado pelos robôs ativos</dt>
                            <dd className="font-medium">{displayBalance(capital.data!.gas)}</dd>
                          </div>
                        </dl>
                      )}
                      <p className="text-xs text-muted-foreground">
                        O disponível desconta as reservas dos robôs ativos. Mantenha BNB adicional
                        para o gás desta nova operação; ele ainda não foi descontado deste valor.
                        Conversões são estimativas.
                      </p>
                    </details>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={capital.isFetching}
                      onClick={() => {
                        void capital.refetch();
                        void fx.refetch();
                      }}
                    >
                      Atualizar saldo disponível
                    </Button>
                  </section>
                  <ValueField
                    label="Quanto quer aplicar no robô?"
                    value={amount}
                    onChange={setAmount}
                  />
                  <label className="block text-sm">
                    Moeda do valor
                    <select
                      className="mt-1 w-full rounded border bg-background p-2"
                      value={amountUnit}
                      onChange={(e) => setAmountUnit(e.target.value)}
                    >
                      {["BRL", "USD", "EUR", "BNB"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Informe somente o valor destinado à compra. O saldo exibido pertence à carteira
                    automática selecionada.
                  </p>
                </div>
              )}
              {step === 1 && (
                <div className="space-y-3">
                  <label className="block text-sm">
                    Como quer definir a entrada?
                    <select
                      className="mt-1 w-full rounded border bg-background p-2"
                      value={entryMode}
                      onChange={(e) => setEntryMode(e.target.value as "price" | "percent")}
                    >
                      <option value="price">Pelo preço do ativo</option>
                      <option value="percent">Por porcentagem de queda</option>
                    </select>
                  </label>
                  {
                    <label className="block text-sm">
                      Moeda dos preços
                      <select
                        className="mt-1 w-full rounded border bg-background p-2"
                        value={priceUnit}
                        onChange={(e) => setPriceUnit(e.target.value)}
                      >
                        {["BRL", "USD", "EUR"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  }
                  <ValueField
                    label={
                      entryMode === "price"
                        ? `Comprar quando o preço for igual ou menor (${priceUnit})`
                        : "Comprar após cair quantos %?"
                    }
                    value={entry}
                    onChange={setEntry}
                  />
                  <p className="text-xs text-muted-foreground">
                    Na porcentagem, a referência atual é fixada ao salvar e não acompanha o preço
                    depois disso.
                  </p>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-3">
                  <label className="block text-sm">
                    Como quer definir a saída?
                    <select
                      className="mt-1 w-full rounded border bg-background p-2"
                      value={exitMode}
                      onChange={(e) => setExitMode(e.target.value as "price" | "percent")}
                    >
                      <option value="price">Pelo preço do ativo</option>
                      <option value="percent">Por porcentagem sobre a compra</option>
                    </select>
                  </label>
                  <ValueField
                    label={
                      exitMode === "price"
                        ? `Vender quando o preço for igual ou maior (${priceUnit})`
                        : "Vender com variação de quantos % sobre a compra?"
                    }
                    value={exit}
                    onChange={setExit}
                  />
                  <p className="text-xs text-muted-foreground">
                    A saída percentual usa o preço registrado da compra, antes dos custos.
                    Percentual negativo é permitido. O robô vende toda a posição e não recompra
                    sozinho.
                  </p>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-3">
                  <p>Quer usar stop loss?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={stopChoice === true ? "default" : "outline"}
                      onClick={() => setStopChoice(true)}
                    >
                      Sim, definir limite
                    </Button>
                    <Button
                      variant={stopChoice === false ? "default" : "outline"}
                      onClick={() => setStopChoice(false)}
                    >
                      Não, prosseguir sem stop
                    </Button>
                  </div>
                  {stopChoice && (
                    <ValueField
                      label="Vender após perder quantos % do preço de compra?"
                      value={stop}
                      onChange={setStop}
                    />
                  )}
                  <details className="rounded border p-3">
                    <summary>Taxas do token (opcional revisar)</summary>
                    <div className="mt-2 space-y-2">
                      <ValueField
                        label="Taxa de compra do token (%)"
                        value={buyTax}
                        onChange={setBuyTax}
                      />
                      <ValueField
                        label="Taxa de venda do token (%)"
                        value={sellTax}
                        onChange={setSellTax}
                      />
                      <p className="text-xs">
                        Valores conhecidos ou informados por você; não são lucro mínimo. Taxas
                        desconhecidas podem fazer o contrato recusar a troca.
                      </p>
                    </div>
                  </details>
                  <ValueField
                    label="Tolerância de execução (slippage %)"
                    value={slippage}
                    onChange={setSlippage}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sem stop, a posição permanece até o preço de saída ou sua ação manual. O preço
                    executado pode diferir do gatilho.
                  </p>
                </div>
              )}
              {step === 4 && plan && (
                <div className="space-y-3 text-sm">
                  <p>
                    <strong>Aplicar:</strong>{" "}
                    {plan.capitalBnb.toLocaleString("pt-BR", { maximumFractionDigits: 12 })} BNB ·
                    conversão fixada nesta revisão.
                  </p>
                  <p>
                    <strong>Entrada:</strong>{" "}
                    {entryMode === "price"
                      ? `${entry} ${priceUnit}`
                      : `queda de ${entry}% da referência ao salvar`}
                    .
                  </p>
                  <p>
                    <strong>Saída:</strong>{" "}
                    {exitMode === "price"
                      ? `${exit} ${priceUnit}`
                      : `${exit}% do preço registrado da compra`}
                    .
                  </p>
                  <p>
                    <strong>Stop loss:</strong>{" "}
                    {stopChoice ? `${stop}%` : "desativado por sua escolha"}.
                  </p>
                  <p>
                    Taxas do token:{" "}
                    {hasVerifiedTax(token)
                      ? `compra ${buyTax}% · venda ${sellTax}%`
                      : `informadas: compra ${buyTax}% · venda ${sellTax}%; não confirmadas na rede`}
                    . A DEX e a rede cobram custos adicionais. A estimativa atual aparecerá na
                    verificação de início.
                  </p>
                  <p className="rounded border border-warning/40 p-3">
                    Você assume os pontos e o resultado. Taxas e gás podem gerar prejuízo mesmo
                    vendendo acima da compra. Não aumentamos sua meta e não exigimos margem mínima.
                    Saldo real, transações pendentes e capacidade de enviar à rede continuam sendo
                    conferidos.
                  </p>
                  <p>
                    Os preços em moeda local são convertidos para USD. Não acompanham variações
                    futuras do câmbio.
                  </p>
                </div>
              )}
              {(error || settings.isError) && (
                <p role="alert" className="break-words text-sm text-destructive">
                  {error || "Não foi possível carregar a configuração. Reabra o assistente."}
                </p>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  variant="outline"
                  disabled={busy || step === 0}
                  onClick={() => {
                    setError("");
                    setStep((s) => s - 1);
                  }}
                >
                  Voltar
                </Button>
                {step < 4 ? (
                  <Button onClick={advance}>Continuar</Button>
                ) : (
                  <Button disabled={busy || !settings.data} onClick={() => void save()}>
                    {busy ? "Salvando…" : "Salvar minha configuração"}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                Configuração salva. Entrada em US${" "}
                {savedEntry?.toLocaleString("pt-BR", { maximumSignificantDigits: 12 })}. O robô
                ainda está pausado.
              </p>
              <div className="rounded border p-3 space-y-2">
                <p>
                  Taxa estimada da compra:{" "}
                  {readiness.data?.feeBnb != null
                    ? `${readiness.data.feeBnb.toFixed(10)} BNB`
                    : "não apurada"}
                  .
                </p>
                <p>
                  Troca de ida e volta (sem gás):{" "}
                  {readiness.data?.exchangeCostBnb != null
                    ? `${readiness.data.exchangeCostBnb.toFixed(10)} BNB`
                    : "não apurada"}
                  .
                </p>
                <p>
                  Referência de gás da venda: {readiness.data?.gasSellReferenceBnb ?? "não apurada"}{" "}
                  BNB. Pode mudar até a execução.
                </p>
                {readiness.data?.errors.map((e) => (
                  <p key={e} className="text-warning">
                    {e}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground">
                  Custos não aumentam sua saída e não exigem lucro mínimo. É necessário ter saldo
                  para pagar a compra e o gás real.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={readiness.isFetching}
                  onClick={() => void readiness.refetch()}
                >
                  Atualizar custos
                </Button>
              </div>
              <p>
                Ao iniciar, o robô espera seus pontos. Se a entrada já estiver atingida, poderá
                comprar na próxima verificação.
              </p>
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              <Button disabled={busy} onClick={() => void start()}>
                {busy ? "Conferindo…" : "Iniciar Manual automático"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
