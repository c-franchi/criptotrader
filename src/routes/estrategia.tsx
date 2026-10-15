import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin } from "@/components/AppShell";
import { EMPTY_CONFIG, describeStrategy, type StrategyConfig } from "@/lib/strategy";
import { PRESETS, buildPreset } from "@/lib/presets";
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
  const set = <K extends keyof StrategyConfig>(k: K, v: StrategyConfig[K]) => setC((p) => ({ ...p, [k]: v }));

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
    });
    getMarket({ data: { address: token.address } }).then((m) => {
      if (alive) setLiq(m.pools.find((p) => p.supported)?.liquidityUsd ?? null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [token.address]);

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
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Panel title="Token da estratégia">
          <div className="flex flex-wrap gap-2">
            {tokens.map((t) => (
              <Button key={t.address} size="sm" variant={t.address === token.address ? "default" : "outline"} onClick={() => selectToken(t.address)}>
                {t.symbol}
              </Button>
            ))}
        <AddTokenDialog wallet={wallet || null} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Cada token tem sua própria estratégia. Liquidez atual do pool {token.symbol}/WBNB:{" "}
            {liq === null ? "indisponível" : `US$ ${liq.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
          </p>
        </Panel>

        <Panel title="Estratégias prontas">
          <Label>Quanto quer usar (em BNB/WBNB)</Label>
          <Input type="number" step="any" min={0} placeholder="ex.: 0,1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {PRESETS.map((p) => (
              <div key={p.id} className="flex flex-col rounded-md border border-border p-3">
                <p className="font-semibold">{p.name}</p>
                <p className="mb-2 text-xs text-muted-foreground">{p.summary}</p>
                <ul className="mb-3 flex-1 space-y-1 text-xs">{p.how.map((h) => <li key={h}>• {h}</li>)}</ul>
                <Button size="sm" disabled={!(Number(amount) > 0)} onClick={() => { setC(buildPreset(p.id, Number(amount), liq)); toast.success(`"${p.name}" montada para ${amount} BNB. Revise e salve.`); }}>
                  Usar esta
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Os campos abaixo são preenchidos automaticamente; ajuste se quiser e salve. Nenhuma estratégia garante lucro.</p>
        </Panel>

        <Panel title="Carteira acompanhada">
          <Label>Endereço (somente leitura de dados públicos)</Label>
          <Input placeholder="0x…" value={wallet} onChange={(e) => setWallet(e.target.value.trim())} />
          <WalletPicker value={wallet} onPick={setWallet} />
          <p className="mt-1 text-xs text-muted-foreground">Vale para todos os tokens. O endereço sozinho não autoriza nenhuma movimentação de fundos.</p>
        </Panel>

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
          <ul className="space-y-2 text-sm">
            {describeStrategy(c).map((l, i) => <li key={i}>• {l}</li>)}
          </ul>
          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          <Button className="mt-4 w-full" onClick={save} disabled={errors.length > 0}>
            Salvar estratégia{version ? ` (atual v${version})` : ""}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Salvar não ativa nenhuma operação real. Execução automática estará disponível em fases futuras.
          </p>
        </Panel>
      </div>
    </div>
  );
}
