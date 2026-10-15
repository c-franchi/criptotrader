import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin } from "@/components/AppShell";
import { EMPTY_CONFIG, describeStrategy, type StrategyConfig } from "@/lib/strategy";
import { PRESETS, buildPreset, type PresetId } from "@/lib/presets";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { WalletPicker } from "@/components/WalletPicker";
import { AddTokenDialog } from "@/components/AddTokenDialog";
import { getMarket } from "@/lib/chain.functions";
import { getFxQuote, getBnbBalance } from "@/lib/fx.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/estrategia")({
  head: () => ({
    meta: [
      { title: "Estratégia — GTE Monitor" },
      { name: "description", content: "Configure regras de entrada, take-profit, stop-loss e limites de risco para o GTE." },
      { property: "og:title", content: "Estratégia — GTE Monitor" },
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

function Num({ label, hint, value, onChange }: { label: string; hint?: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
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
  const chosen = PRESETS.find((p) => p.id === c.presetId) ?? null;
  const applyPreset = (id: PresetId) => {
    setC(buildPreset(id, amountBnb, liq));
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
                  <p className={cn("font-semibold", on && "text-primary")}>{p.name}</p>
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

        <Panel title="Entrada">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tamanho da compra</Label>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.sizingMode} onChange={(e) => set("sizingMode", e.target.value as "fixo")}>
                <option value="percentual">% do saldo disponível</option>
                <option value="fixo">Valor fixo</option>
              </select>
            </div>
            <Num label={c.sizingMode === "fixo" ? "Valor por compra (moeda do par)" : "% do saldo usado na compra"} value={c.buyAmount} onChange={(n) => set("buyAmount", n)} />
            <div>
              <Label>Tipo de sinal</Label>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.entryType} onChange={(e) => set("entryType", e.target.value as "queda")}>
                <option value="queda">Queda percentual</option>
                <option value="medias">Cruzamento de médias</option>
              </select>
            </div>
            {c.entryType === "queda" ? (
              <>
                <Num label="Queda que dispara a compra (%)" hint="Movimento do preço, não do saldo." value={c.dropPct} onChange={(n) => set("dropPct", n)} />
                <div>
                  <Label>Referência da queda</Label>
                  <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.referenceType} onChange={(e) => set("referenceType", e.target.value as "manual")}>
                    <option value="maxima">Máxima na janela</option>
                    <option value="manual">Preço definido por mim</option>
                  </select>
                </div>
                {c.referenceType === "manual" ? (
                  <Num label="Preço de referência (moeda do par)" value={c.manualReference} onChange={(n) => set("manualReference", n)} />
                ) : (
                  <Num label="Janela (horas)" value={c.windowHours} onChange={(n) => set("windowHours", n)} />
                )}
              </>
            ) : (
              <>
                <Num label="Média rápida (velas)" value={c.maFast} onChange={(n) => set("maFast", n)} />
                <Num label="Média lenta (velas)" value={c.maSlow} onChange={(n) => set("maSlow", n)} />
                <div>
                  <Label>Intervalo das velas</Label>
                  <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.candleInterval} onChange={(e) => set("candleInterval", e.target.value)}>
                    {["5m", "15m", "1h", "4h"].map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
              </>
            )}
            <Num label="Liquidez mínima (US$)" value={c.minLiquidityUsd} onChange={(n) => set("minLiquidityUsd", n)} />
            <Num label="Máx. entradas por posição" value={c.maxEntries} onChange={(n) => set("maxEntries", n)} />
            <Num label="Intervalo mínimo entre compras (min)" value={c.cooldownMin} onChange={(n) => set("cooldownMin", n)} />
            <Num label={`Exposição máxima ao ${token.symbol} (moeda do par)`} value={c.maxExposureQuote} onChange={(n) => set("maxExposureQuote", n)} />
            <Num label="Reserva de BNB para gas" value={c.gasReserveBnb} onChange={(n) => set("gasReserveBnb", n)} />
            <Num label="Máx. operações por dia" value={c.maxTradesPerDay} onChange={(n) => set("maxTradesPerDay", n)} />
          </div>
        </Panel>

        <Panel title="Saídas e risco" right={<Button size="sm" variant="outline" onClick={() => set("takeProfits", [...c.takeProfits, { pct: 0, sellPct: 0 }])}>+ Take-profit</Button>}>
          <div className="space-y-3">
            {c.takeProfits.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Num label={`TP ${i + 1}: valorização sobre preço médio (%)`} value={t.pct} onChange={(n) => set("takeProfits", c.takeProfits.map((x, j) => (j === i ? { ...x, pct: n } : x)))} />
                <Num label="% do saldo remanescente vendido" value={t.sellPct} onChange={(n) => set("takeProfits", c.takeProfits.map((x, j) => (j === i ? { ...x, sellPct: n } : x)))} />
                <Button variant="ghost" size="sm" onClick={() => set("takeProfits", c.takeProfits.filter((_, j) => j !== i))}>Remover</Button>
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <Num label="Stop-loss: queda sobre preço médio (%)" hint="0 = desativado" value={c.stopLossPct} onChange={(n) => set("stopLossPct", n)} />
              <Num label="Limite de perda diária (moeda do par)" value={c.dailyLossLimit} onChange={(n) => set("dailyLossLimit", n)} />
              <Num label="Slippage máximo (%)" value={c.maxSlippagePct} onChange={(n) => set("maxSlippagePct", n)} />
              <Num label="Impacto de preço máximo (%)" value={c.maxPriceImpactPct} onChange={(n) => set("maxPriceImpactPct", n)} />
              <Num label="Gas máximo (gwei)" value={c.maxGasGwei} onChange={(n) => set("maxGasGwei", n)} />
              <Num label="Tentativas após falha" value={c.maxRetries} onChange={(n) => set("maxRetries", n)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={c.trailingEnabled} onCheckedChange={(v) => set("trailingEnabled", v)} />
              <span className="text-sm">Trailing stop</span>
            </div>
            {c.trailingEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Num label="Lucro para ativar (%)" value={c.trailingActivatePct} onChange={(n) => set("trailingActivatePct", n)} />
                <Num label="Distância da máxima (%)" value={c.trailingDistancePct} onChange={(n) => set("trailingDistancePct", n)} />
              </div>
            )}
          </div>
        </Panel>
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
