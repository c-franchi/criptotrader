import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin } from "@/components/AppShell";
import { EMPTY_CONFIG, describeStrategy, type StrategyConfig } from "@/lib/strategy";
import { PRESETS, buildPreset, type PresetId } from "@/lib/presets";
import { breakEvenPct, taxFor } from "@/lib/tokens";
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
      { name: "description", content: "Configure regras de entrada, take-profit, stop-loss e limites de risco para o GTE." },
      { property: "og:title", content: "Estratégia — CryptoBot" },
      { property: "og:description", content: "Configure regras de entrada, take-profit, stop-loss e limites de risco para o GTE." },
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

function Num({ label, hint, help, value, onChange }: { label: string; hint?: string; help?: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex items-center gap-1"><Label className="text-sm">{label}</Label>{help && <HelpTip title={label}><p>{help}</p></HelpTip>}</div>
      <Input type="number" step="any" min={0} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StrategyForm() {
  const { user } = useAuth();
  const { token, selectToken, tokens } = useSelectedToken();
  const [c, setC] = useState<StrategyConfig>(EMPTY_CONFIG);
  const [wallet, setWallet] = useState("");
  const [version, setVersion] = useState(0);
  const [liq, setLiq] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"BRL" | "BNB">("BRL");
  const [fx, setFx] = useState<{ bnbUsd: number | null; usdBrl: number | null } | null>(null);
  const [bnbBalance, setBnbBalance] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const set = <K extends keyof StrategyConfig>(k: K, v: StrategyConfig[K]) => { setEdited(true); setC((p) => ({ ...p, [k]: v })); };
  const [measured, setMeasured] = useState<{ buy: number; sell: number } | null | "loading" | "fail">(null);
  const auto = measured && typeof measured === "object" ? measured : null;
  const tax = taxFor(token.address, { buyTaxPct: c.buyTaxPct ?? auto?.buy, sellTaxPct: c.sellTaxPct ?? auto?.sell });
  const measure = (apply: boolean) => {
    setMeasured("loading");
    getTokenTax({ data: { address: token.address } }).then((r) => {
      if (!r.tax) return void setMeasured("fail");
      setMeasured(r.tax);
      if (apply) { set("buyTaxPct", r.tax.buy); set("sellTaxPct", r.tax.sell); }
    }).catch(() => setMeasured("fail"));
  };
  const chosen = PRESETS.find((p) => p.id === c.presetId) ?? null;
  const applyPreset = (id: PresetId) => {
    setC(buildPreset(id, amountBnb, liq, tax));
    setEdited(false);
    const p = PRESETS.find((x) => x.id === id)!;
    toast.success(`"${p.name}" montada: compra ${token.symbol} com até ${amountBnb.toFixed(4)} BNB. Revise e salve.`);
  };

  useEffect(() => {
    let alive = true;
    setLiq(null);
    supabase.from("strategies").select("*").order("updated_at", { ascending: false }).then(({ data }) => {
      if (!alive) return;
      const rows = data ?? [];
      const own = rows.find((r) => r.token.toLowerCase() === token.address.toLowerCase());
      setWallet(rows.find((r) => r.tracked_wallet)?.tracked_wallet ?? "");
      setC(own ? { ...EMPTY_CONFIG, ...(own.config as Partial<StrategyConfig>) } : EMPTY_CONFIG);
      setVersion(own?.version ?? 0);
      setEdited(false);
    });
    measure(false);
    getMarket({ data: { address: token.address } }).then((m) => {
      if (alive) setLiq(m.pools.find((p) => p.supported)?.liquidityUsd ?? null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [token.address]);

  useEffect(() => {
    let alive = true;
    getFxQuote().then((q) => alive && setFx(q)).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setBnbBalance(null);
    if (/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      getBnbBalance({ data: { address: wallet } }).then((b) => alive && setBnbBalance(b)).catch(() => {});
    }
    return () => { alive = false; };
  }, [wallet]);

  const bnbBrl = fx?.bnbUsd != null && fx?.usdBrl != null ? fx.bnbUsd * fx.usdBrl : null;
  const typed = Number(amount) || 0;
  const amountBnb = currency === "BNB" ? typed : bnbBrl ? typed / bnbBrl : 0;
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const walletOk = /^0x[0-9a-fA-F]{40}$/.test(wallet);

  const errors: string[] = [];
  if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) errors.push("Endereço de carteira inválido.");
  if (c.sizingMode === "percentual" && c.buyAmount > 100) errors.push("Percentual do saldo não pode passar de 100%.");
  if (c.takeProfits.some((t) => t.sellPct <= 0 || t.sellPct > 100)) errors.push("Percentual vendido deve estar entre 0 e 100.");
  if (c.entryType === "medias" && c.maFast >= c.maSlow) errors.push("A média rápida deve ser menor que a lenta.");

  const save = async () => {
    if (!user || errors.length) return;
    const { error } = await supabase.from("strategies").upsert(
      { user_id: user.id, token: token.address, config: c, tracked_wallet: wallet || null, version: version + 1, updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" },
    );
    if (error) return void toast.error(error.message);
    // The wallet is shared by every token strategy.
    await supabase.from("strategies").update({ tracked_wallet: wallet || null }).eq("user_id", user.id);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "estrategia_salva", details: { token: token.symbol, version: version + 1, config: c } });
    setVersion(version + 1);
    toast.success(`Estratégia de ${token.symbol} salva (versão ${version + 1})`);
    setAskTrade(true);
  };
  const [askTrade, setAskTrade] = useState(false);
  const navigate = useNavigate();
  const firstEntry = c.sizingMode === "fixo" && c.buyAmount > 0 ? c.buyAmount : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Panel title="Passo 1 · Escolha sua carteira">
          <p className="mb-2 text-xs text-muted-foreground">Comece por aqui: é dessa carteira que sai o BNB para comprar e para onde volta o BNB das vendas.</p>
          <WalletPicker value={wallet} onPick={setWallet} />
          <Input className="mt-2" placeholder="ou cole o endereço 0x…" value={wallet} onChange={(e) => setWallet(e.target.value.trim())} />
          {walletOk ? (
            <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Saldo de BNB nesta carteira</p>
              <p className="text-xl font-semibold">{bnbBalance === null ? "carregando…" : `${Number(bnbBalance).toLocaleString("pt-BR", { maximumFractionDigits: 5 })} BNB`}</p>
              {bnbBalance !== null && bnbBrl && <p className="text-sm text-muted-foreground">≈ {brl(Number(bnbBalance) * bnbBrl)}</p>}
              {bnbBalance !== null && Number(bnbBalance) < 0.002 && <p className="mt-1 text-xs text-destructive">Saldo baixo: deixe pelo menos ~0,002 BNB para pagar as taxas de rede (gás).</p>}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{wallet ? "Endereço inválido." : "Nenhuma carteira escolhida ainda."} O endereço sozinho não autoriza nenhuma movimentação.</p>
          )}
        </Panel>

        <fieldset disabled={!walletOk} className={walletOk ? "space-y-4" : "space-y-4 opacity-50"}>
        <Panel title="Passo 2 · Escolha o token">
          <div className="flex flex-wrap gap-2">
            {tokens.map((t) => (
              <Button key={t.address} size="sm" variant={t.address === token.address ? "default" : "outline"} onClick={() => selectToken(t.address)}>
                {t.symbol}
              </Button>
            ))}
            <AddTokenDialog wallet={wallet || null} />
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-border p-2"><span className="font-semibold">Comprar:</span> você paga <b>BNB</b> e recebe <b>{token.symbol}</b></div>
            <div className="rounded-md border border-border p-2"><span className="font-semibold">Vender:</span> você entrega <b>{token.symbol}</b> e recebe <b>BNB</b></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Liquidez atual do pool {token.symbol}/BNB:{" "}
            {liq === null ? "indisponível" : `US$ ${liq.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
          </p>
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="text-sm font-semibold">Taxa cobrada pelo {token.symbol}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">Na compra (%)
                <Input type="number" step="any" min={0} max={50} value={tax.buy} onChange={(e) => set("buyTaxPct", Math.min(50, Math.max(0, Number(e.target.value) || 0)))} />
              </label>
              <label className="text-xs text-muted-foreground">Na venda (%)
                <Input type="number" step="any" min={0} max={50} value={tax.sell} onChange={(e) => set("sellTaxPct", Math.min(50, Math.max(0, Number(e.target.value) || 0)))} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {measured === "loading" && <span className="text-muted-foreground">Medindo a taxa direto no contrato…</span>}
              {auto && <span>✓ Medido no contrato agora: compra <b>{auto.buy}%</b> · venda <b>{auto.sell}%</b></span>}
              {measured === "fail" && <span className="text-destructive">Não deu para medir a taxa automaticamente. Preencha à mão.</span>}
              <Button type="button" size="sm" variant="outline" onClick={() => measure(true)} disabled={measured === "loading"}>Medir de novo e usar</Button>
            </div>
            <p className="mt-2 text-xs">
              {tax.buy + tax.sell > 0
                ? <>Com essas taxas, o preço precisa subir <b>{breakEvenPct(tax).toFixed(1)}%</b> só para empatar. As metas de venda das estratégias prontas já somam isso.</>
                : "Nenhuma taxa informada. Se o token cobrar taxa, preencha aqui para a estratégia não vender no prejuízo."}
            </p>
          </div>
        </Panel>

        <Panel title={`Passo 3 · Quanto de BNB usar para comprar ${token.symbol}`}>
          <div className="mb-2 flex gap-2">
            {(["BRL", "BNB"] as const).map((cur) => (
              <Button key={cur} size="sm" variant={currency === cur ? "default" : "outline"} onClick={() => setCurrency(cur)}>
                {cur === "BRL" ? "Real (R$)" : "BNB"}
              </Button>
            ))}
          </div>
          <Input type="number" step="any" min={0} placeholder={currency === "BRL" ? "ex.: 100" : "ex.: 0,1"} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="mt-1 text-sm">
            {typed > 0 && amountBnb > 0
              ? <>= <b>{amountBnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB</b>{bnbBrl ? <> ≈ {brl(amountBnb * bnbBrl)}</> : null} que serão trocados por {token.symbol}</>
              : currency === "BRL" && !bnbBrl ? "Cotação do real indisponível agora; use BNB." : "Digite um valor."}
          </p>
          {bnbBalance !== null && amountBnb > Number(bnbBalance) && <p className="text-xs text-destructive">Valor maior que o saldo de BNB da carteira.</p>}

          <p className="mt-4 mb-2 text-sm font-semibold">Passo 4 · Escolha um estilo</p>
          <div className="mb-3 rounded-md border border-border bg-muted/30 p-2.5">
            {chosen ? (
              <>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Check className="h-4 w-4 shrink-0" /> Estilo escolhido: {chosen.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {edited
                    ? `Você ajustou campos à mão — a estratégia continua salva como ${chosen.name}.`
                    : "Os campos abaixo são exatamente esta estratégia."}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum estilo escolhido ainda: toque em “Usar esta” para preencher os campos.</p>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {PRESETS.map((p) => {
              const on = c.presetId === p.id;
              return (
                <div
                  key={p.id}
                  data-selected={on}
                  className={cn(
                    "relative flex flex-col rounded-md p-3 transition-colors",
                    on ? "border-2 border-primary bg-primary/10" : "border border-border hover:border-primary/50",
                  )}
                >
                  {on && (
                    <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                      <Check className="h-3 w-3" /> Em uso
                    </span>
                  )}
                  <div className="flex items-center gap-1.5"><p className={cn("font-semibold", on && "text-primary")}>{p.name}</p><HelpTip title={p.name}><p>{p.summary}</p><ul className="list-disc space-y-1 pl-4">{p.how.map((h) => <li key={h}>{h}</li>)}</ul><p className="text-foreground">{p.forWho}</p></HelpTip></div>
                  <p className="mb-2 text-xs text-muted-foreground">{p.summary}</p>
                  <ul className="mb-3 flex-1 space-y-1 text-xs">{p.how.map((h) => <li key={h}>• {h}</li>)}</ul>
                  <Button size="sm" variant={on ? "default" : "outline"} disabled={!(amountBnb > 0)} onClick={() => applyPreset(p.id)}>
                    {on ? (
                      <>
                        <Check className="h-4 w-4" /> {edited ? "Reaplicar" : "Selecionada"}
                      </>
                    ) : (
                      "Usar esta"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Compras usam BNB para obter {token.symbol}; vendas (lucro ou stop) devolvem BNB. Os campos abaixo são preenchidos sozinhos — revise e salve. Nenhuma estratégia garante lucro.</p>
        </Panel>
        </fieldset>

        <Panel title="Entrada (quando comprar)" collapsible>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-1"><Label>Tamanho da compra</Label><HelpTip title="Tamanho da compra"><p><b>Valor fixo:</b> sempre a mesma quantia de BNB.</p><p><b>% do saldo:</b> uma porcentagem do BNB que estiver na carteira.</p></HelpTip></div>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.sizingMode} onChange={(e) => set("sizingMode", e.target.value as "fixo")}>
                <option value="percentual">% do saldo disponível</option>
                <option value="fixo">Valor fixo</option>
              </select>
            </div>
            <Num label={c.sizingMode === "fixo" ? "Valor por compra (moeda do par)" : "% do saldo usado na compra"} value={c.buyAmount} help="Quanto o robô usa em cada compra. Ex.: com 0,01 BNB por compra e 3 compras, o máximo gasto é 0,03 BNB. Comece com pouco." onChange={(n) => set("buyAmount", n)} />
            <div>
              <div className="flex items-center gap-1"><Label>Tipo de sinal</Label><HelpTip title="Tipo de sinal"><p><b>Queda percentual:</b> compra quando o preço cai X% — bom para comprar barato.</p><p><b>Cruzamento de médias:</b> compra quando o preço começa a subir — segue a tendência.</p></HelpTip></div>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.entryType} onChange={(e) => set("entryType", e.target.value as "queda")}>
                <option value="queda">Queda percentual</option>
                <option value="medias">Cruzamento de médias</option>
              </select>
            </div>
            {c.entryType === "queda" ? (
              <>
                <Num label="Queda que dispara a compra (%)" hint="Movimento do preço, não do saldo." value={c.dropPct} help="Quanto o preço precisa cair para comprar. Ex.: 10% significa comprar quando o token ficar 10% mais barato que a referência. Quedas maiores = compras mais raras e mais baratas." onChange={(n) => set("dropPct", n)} />
                <div>
                  <div className="flex items-center gap-1"><Label>Referência da queda</Label><HelpTip title="Referência da queda"><p>De onde a queda é contada: do preço mais alto recente (automático) ou de um preço que você define.</p></HelpTip></div>
                  <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.referenceType} onChange={(e) => set("referenceType", e.target.value as "manual")}>
                    <option value="maxima">Máxima na janela</option>
                    <option value="manual">Preço definido por mim</option>
                  </select>
                </div>
                {c.referenceType === "manual" ? (
                  <Num label="Preço de referência (moeda do par)" value={c.manualReference} help="Preço que você considera 'normal'. A queda é medida a partir dele. Use o preço de hoje se não souber." onChange={(n) => set("manualReference", n)} />
                ) : (
                  <Num label="Janela (horas)" value={c.windowHours} help="Período usado para achar o preço mais alto. Ex.: 24h = a queda é medida a partir da máxima do último dia." onChange={(n) => set("windowHours", n)} />
                )}
              </>
            ) : (
              <>
                <Num label="Média rápida (velas)" value={c.maFast} help="Média do preço das últimas poucas velas. Reage rápido às mudanças." onChange={(n) => set("maFast", n)} />
                <Num label="Média lenta (velas)" value={c.maSlow} help="Média de mais velas, reage devagar. Quando a média rápida passa acima da lenta, sinal de que o preço começou a subir." onChange={(n) => set("maSlow", n)} />
                <div>
                  <Label>Intervalo das velas</Label>
                  <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.candleInterval} onChange={(e) => set("candleInterval", e.target.value)}>
                    {["5m", "15m", "1h", "4h"].map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
              </>
            )}
            <Num label="Liquidez mínima (US$)" value={c.minLiquidityUsd} help="Dinheiro disponível no pool para trocas. Pouca liquidez = preço salta muito e pode ser difícil vender. Abaixo deste valor, não compra." onChange={(n) => set("minLiquidityUsd", n)} />
            <Num label="Máx. entradas por posição" value={c.maxEntries} help="Quantas vezes pode comprar antes de vender. Comprar em partes ajuda a pegar um preço médio melhor se continuar caindo." onChange={(n) => set("maxEntries", n)} />
            <Num label="Intervalo mínimo entre compras (min)" value={c.cooldownMin} help="Tempo mínimo de espera entre uma compra e outra, para não gastar tudo numa queda rápida." onChange={(n) => set("cooldownMin", n)} />
            <Num label={`Exposição máxima ao ${token.symbol} (moeda do par)`} value={c.maxExposureQuote} help="Teto total de BNB aplicado neste token. Protege para não colocar tudo num só lugar." onChange={(n) => set("maxExposureQuote", n)} />
            <Num label="Reserva de BNB para gas" value={c.gasReserveBnb} help="BNB guardado para pagar as taxas da rede. Sem ele, você não consegue nem vender." onChange={(n) => set("gasReserveBnb", n)} />
            <Num label="Máx. operações por dia" value={c.maxTradesPerDay} help="Limite de operações por dia. Menos operações = menos taxas pagas." onChange={(n) => set("maxTradesPerDay", n)} />
          </div>
        </Panel>

        <Panel title="Saídas e risco (quando vender)" collapsible right={<Button size="sm" variant="outline" onClick={() => set("takeProfits", [...c.takeProfits, { pct: 0, sellPct: 0 }])}>+ Take-profit</Button>}>
          <div className="space-y-3">
            {c.takeProfits.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Num label={`TP ${i + 1}: valorização sobre preço médio (%)`} help="Take-profit (realizar lucro): quando o preço subir esse % acima do que você pagou, vende uma parte. Ex.: +10% vende metade e garante o ganho." value={t.pct} onChange={(n) => set("takeProfits", c.takeProfits.map((x, j) => (j === i ? { ...x, pct: n } : x)))} />
                <Num label="% do saldo remanescente vendido" help="Quanto do que sobrou vender nesse alvo. 100% = vende tudo." value={t.sellPct} onChange={(n) => set("takeProfits", c.takeProfits.map((x, j) => (j === i ? { ...x, sellPct: n } : x)))} />
                <Button variant="ghost" size="sm" onClick={() => set("takeProfits", c.takeProfits.filter((_, j) => j !== i))}>Remover</Button>
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <Num label="Stop-loss: queda sobre preço médio (%)" hint="0 = desativado" value={c.stopLossPct} help="Venda de proteção: se o preço cair esse % abaixo do que você pagou, vende tudo para não perder mais. 0 = desligado." onChange={(n) => set("stopLossPct", n)} />
              <Num label="Limite de perda diária (moeda do par)" value={c.dailyLossLimit} help="Se as perdas do dia chegarem a esse valor, o robô para até o dia seguinte." onChange={(n) => set("dailyLossLimit", n)} />
              <Num label="Slippage máximo (%)" value={c.maxSlippagePct} help="Quanto o preço pode mudar entre a cotação e a execução. Tokens com taxa precisam de um valor um pouco maior." onChange={(n) => set("maxSlippagePct", n)} />
              <Num label="Impacto de preço máximo (%)" value={c.maxPriceImpactPct} help="Quanto a sua própria compra/venda move o preço. Alto = você paga mais caro. Evite passar de 3%." onChange={(n) => set("maxPriceImpactPct", n)} />
              <Num label="Gas máximo (gwei)" value={c.maxGasGwei} help="Preço máximo da taxa de rede. Se a rede estiver cara, espera." onChange={(n) => set("maxGasGwei", n)} />
              <Num label="Tentativas após falha" value={c.maxRetries} help="Quantas vezes tentar de novo se uma troca falhar." onChange={(n) => set("maxRetries", n)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={c.trailingEnabled} onCheckedChange={(v) => set("trailingEnabled", v)} />
              <span className="text-sm">Trailing stop</span><HelpTip title="Trailing stop (stop móvel)"><p>Segue o preço para cima. Depois de lucrar, se o preço virar e cair um pouco do topo, vende e garante o ganho.</p></HelpTip>
            </div>
            {c.trailingEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Num label="Lucro para ativar (%)" value={c.trailingActivatePct} help="Lucro a partir do qual o 'stop móvel' começa a seguir o preço." onChange={(n) => set("trailingActivatePct", n)} />
                <Num label="Distância da máxima (%)" value={c.trailingDistancePct} help="Se o preço cair esse % do ponto mais alto depois de ativado, vende e garante o lucro." onChange={(n) => set("trailingDistancePct", n)} />
              </div>
            )}
          </div>
        </Panel>
        <TokenAlerts token={token} tax={tax} />
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Panel title="Prévia em linguagem simples">
          {chosen && (
            <p className="mb-3 flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 p-2 text-sm font-semibold text-primary">
              <Check className="h-4 w-4 shrink-0" /> {chosen.name}
              {edited && <span className="font-normal text-muted-foreground">(com ajustes manuais)</span>}
            </p>
          )}
          <ul className="space-y-2 text-sm">
            {describeStrategy(c).map((l, i) => <li key={i}>• {l}</li>)}
          </ul>
          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          <AlertDialog open={askTrade} onOpenChange={setAskTrade}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Estratégia salva! Fazer a primeira compra agora?</AlertDialogTitle>
                <AlertDialogDescription>
                  Você vai para Operar com a estratégia de {token.symbol} já carregada
                  {firstEntry ? <> e a primeira entrada preenchida com <b>{firstEntry} BNB</b></> : null}.
                  Lá você só confere o valor, conecta a carteira e confirma: paga BNB e recebe {token.symbol}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Agora não</AlertDialogCancel>
                <AlertDialogAction onClick={() => navigate({ to: "/operar", search: firstEntry ? { entrada: String(firstEntry) } : {} })}>
                  Ir para a operação
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button className="mt-4 w-full" onClick={save} disabled={errors.length > 0}>
            Salvar estratégia{chosen ? ` · ${chosen.name}` : ""}{version ? ` (atual v${version})` : ""}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Salvar não ativa nenhuma operação real. Execução automática estará disponível em fases futuras.
          </p>
        </Panel>
      </div>
    </div>
  );
}
