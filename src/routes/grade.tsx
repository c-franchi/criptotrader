import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin, Unavailable } from "@/components/AppShell";
import { createBotWallet, getBotWallet, runGridNow, withdrawBot } from "@/lib/bot.functions";
import { AddTokenDialog } from "@/components/AddTokenDialog";
import { HelpTip } from "@/components/HelpTip";
import { FundBotDialog } from "@/components/FundBotDialog";
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
      { name: "description", content: "Robô que compra e vende sozinho na PancakeSwap seguindo a estratégia que você salvou, com carteira própria." },
      { property: "og:title", content: "Robô automático — CryptoBot" },
      { property: "og:description", content: "Robô que segue sua estratégia salva, com carteira dedicada e botão de ligar e desligar." },
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
const blank = { lower_price: "", upper_price: "", levels: "10", order_bnb: "0.01", max_slippage_pct: "3", max_impact_pct: "3", gas_reserve_bnb: "0.005" };

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className={`flex gap-3 rounded-md border p-2.5 ${done ? "border-success/40 bg-success/5" : "border-border"}`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-success text-success-foreground" : "bg-secondary text-muted-foreground"}`}>{done ? "✓" : n}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{title} {done && <span className="text-xs text-success">· pronto</span>}</p>
        {!done && children && <div className="mt-1 text-xs text-muted-foreground">{children}</div>}
      </div>
    </li>
  );
}

function Robo() {
  const { user } = useAuth();
  const getW = useServerFn(getBotWallet), createW = useServerFn(createBotWallet), withdraw = useServerFn(withdrawBot), runNow = useServerFn(runGridNow);
  const { token: selected, selectToken: setToken, tokens } = useSelectedToken();
  const token = selected.address;
  const sym = selected.symbol;
  const [w, setW] = useState<Wallet | null>(null);
  const [bot, setBot] = useState<Bot | null>(null);
  const [mode, setMode] = useState<Mode>("estrategia");
  const [cfg, setCfg] = useState<StrategyConfig | null | undefined>(undefined);
  const [f, setF] = useState(blank);
  const [orders, setOrders] = useState<Tables<"orders">[]>([]);
  const [busy, setBusy] = useState(false);
  const { wallets: saved } = useSavedWallets();
  const [dest, setDest] = useState("");

  const load = useCallback(async () => {
    getW().then(setW).catch(() => setW({ address: null, bnb: null, tokens: [] }));
    const { data } = await supabase.from("grid_bots").select("*").eq("token", token).maybeSingle();
    setBot(data);
    setMode((data?.mode as Mode) ?? "estrategia");
    setF(data && data.mode === "grade" ? Object.fromEntries(Object.keys(blank).map((k) => [k, String((data as Record<string, unknown>)[k])])) as typeof blank : blank);
    const { data: s } = await supabase.from("strategies").select("config").ilike("token", token).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    setCfg(s ? { ...EMPTY_CONFIG, ...(s.config as Partial<StrategyConfig>) } : null);
    const { data: o } = await supabase.from("orders").select("*").in("source", ["grade", "robo"]).order("created_at", { ascending: false }).limit(20);
    setOrders(o ?? []);
  }, [token, getW]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const save = async (armed?: boolean) => {
    if (!user) return;
    if (armed && !w?.address) return void toast.error("Crie a carteira do robô antes de ligar");
    let row: Record<string, unknown> = { user_id: user.id, token, mode, armed: armed ?? bot?.armed ?? false, updated_at: new Date().toISOString() };
    if (mode === "estrategia") {
      if (armed && !cfg) return void toast.error(`Salve uma estratégia para ${sym} antes de ligar o robô`);
    } else {
      const lo = Number(f.lower_price), hi = Number(f.upper_price), lv = Number(f.levels), ob = Number(f.order_bnb);
      if (!(hi > lo && lo > 0)) return void toast.error("Preço máximo precisa ser maior que o mínimo");
      if (!(lv >= 2 && lv <= 100) || !(ob > 0)) return void toast.error("Revise faixas e valor por ordem");
      row = { ...row, lower_price: lo, upper_price: hi, levels: lv, order_bnb: ob, max_slippage_pct: Number(f.max_slippage_pct), max_impact_pct: Number(f.max_impact_pct), gas_reserve_bnb: Number(f.gas_reserve_bnb),
        ...(bot && (bot.lower_price !== lo || bot.upper_price !== hi || bot.levels !== lv) ? { last_level: null } : {}) };
    }
    const { error } = await supabase.from("grid_bots").upsert(row as never, { onConflict: "user_id,token" });
    if (error) return void toast.error("Não foi possível salvar");
    await supabase.from("audit_log").insert({ user_id: user.id, action: armed === undefined ? "bot_saved" : armed ? "bot_armed" : "bot_disarmed", details: row as never });
    toast.success(armed === undefined ? "Configuração salva" : armed ? "Robô LIGADO" : "Robô desligado");
    load();
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); load(); }
  };

  const bnb = w?.bnb != null ? Number(w.bnb) : null;
  const reserve = mode === "estrategia" ? cfg?.gasReserveBnb || 0.003 : Number(f.gas_reserve_bnb);
  const hasFunds = bnb != null && bnb > reserve;
  const st = normalizeState(bot?.strat_state, Date.now());
  const preset = cfg?.presetId ? PRESETS.find((p) => p.id === cfg.presetId) : undefined;
  const armed = !!bot?.armed;
  const lo = Number(f.lower_price), hi = Number(f.upper_price), lv = Number(f.levels);
  const lines = hi > lo && lv >= 2 && lv <= 100 ? Array.from({ length: lv + 1 }, (_, i) => lo + (i * (hi - lo)) / lv) : [];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-primary/30 bg-card p-4">
        <h1 className="text-lg font-semibold">Robô automático</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O robô olha o preço a cada minuto e <strong className="text-foreground">segue a estratégia que você salvou</strong> para o token: compra com BNB quando o preço chega no seu ponto de compra e vende por BNB quando chega na meta de lucro ou no limite de perda. Você não precisa assinar nada — ele usa uma carteira só dele.
        </p>
        <div className="mt-3 rounded border border-destructive/50 bg-destructive/10 p-2.5 text-xs">
          <strong>Dinheiro real, sem confirmação.</strong> Ligado, o robô troca sozinho. Coloque na carteira dele só o que aceita perder. Nenhuma estratégia garante lucro.
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {tokens.map((t) => (
          <Button key={t.address} size="sm" variant={t.address === token ? "default" : "secondary"} onClick={() => setToken(t.address)}>{t.symbol}</Button>
        ))}
        <AddTokenDialog />
      </div>

      <Panel collapsible title="Como funciona a carteira do robô (leia antes)">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <p className="font-semibold text-primary">👛 Sua carteira</p>
            <p className="mt-1 text-xs text-muted-foreground">A que você já usa (MetaMask, Trust…). Continua só sua. O robô <strong className="text-foreground">não tem acesso</strong> a ela.</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="font-semibold text-primary">➡️ Você envia</p>
            <p className="mt-1 text-xs text-muted-foreground">Com o botão "Enviar BNB da minha carteira", você escolhe o valor e confirma no seu app. Só esse valor passa para o robô.</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="font-semibold text-primary">🤖 Carteira do robô</p>
            <p className="mt-1 text-xs text-muted-foreground">Uma carteira real e separada na rede BSC (dá para ver na BscScan). Ele compra e vende só com o que está nela.</p>
          </div>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>🔒 A chave da carteira do robô é criada no servidor e guardada criptografada. Ninguém a vê — nem você, nem a equipe.</li>
          <li>🔒 O CryptoBot <strong className="text-foreground">nunca</strong> pede sua frase secreta ou chave privada. Se alguém pedir, é golpe.</li>
          <li>🔒 O dinheiro do robô só pode voltar para uma carteira sua salva em Minhas carteiras há mais de 24 horas.</li>
          <li>💡 Deixe no robô só um valor pequeno que aceita arriscar. Para recuperar tudo, use "Desligar e devolver tudo".</li>
        </ul>
      </Panel>

      <Panel title={`Para o robô funcionar com ${sym}`}>
        <ol className="space-y-2">
          <Step n={1} done={!!w?.address} title="Criar a carteira do robô">
            É uma carteira nova, só do robô. A chave fica guardada criptografada no servidor e ninguém vê. Toque em "Criar carteira do robô" abaixo.
          </Step>
          <Step n={2} done={hasFunds} title="Colocar BNB na carteira do robô">
            Toque em "Enviar BNB da minha carteira" (abaixo), escolha o valor e confirme no app da sua carteira. Ele precisa de BNB para comprar e um pouquinho para o gás ({reserve} BNB fica guardado para isso).
            {w?.address && <div className="mt-2"><FundBotDialog botAddress={w.address} onDone={load} /></div>}
          </Step>
          <Step n={3} done={mode === "grade" || !!cfg} title={`Salvar uma estratégia para ${sym}`}>
            O robô faz exatamente o que a estratégia diz. <Link to="/estrategia" className="text-primary underline">Criar estratégia ›</Link>
          </Step>
          <Step n={4} done={armed} title="Ligar o robô">Revise o resumo abaixo e toque em "Ligar robô".</Step>
        </ol>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="O que o robô vai seguir" right={<HelpTip title="Qual modo escolher?"><p><strong>Minha estratégia</strong> (recomendado): usa as regras que você salvou em Estratégia — quando comprar, quanto, metas de lucro, stop-loss, limites por dia e a taxa do token.</p><p className="mt-2"><strong>Grade de preços</strong> (avançado): você define um preço mínimo e máximo; o robô compra um pouco a cada degrau de queda e vende a cada degrau de alta.</p></HelpTip>}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["estrategia", "grade"] as const).map((m) => (
              <button key={m} disabled={armed} onClick={() => setMode(m)}
                className={`rounded-md border p-2 text-left text-xs disabled:opacity-60 ${mode === m ? "border-primary bg-primary/10" : "border-border"}`}>
                <span className="block font-semibold">{mode === m && "✓ "}{m === "estrategia" ? "Minha estratégia" : "Grade de preços"}</span>
                <span className="text-muted-foreground">{m === "estrategia" ? "Recomendado" : "Avançado"}</span>
              </button>
            ))}
          </div>
          {armed && <p className="mb-2 text-[11px] text-muted-foreground">Desligue o robô para trocar o modo.</p>}
          {mode === "estrategia" && (cfg === undefined ? <Unavailable reason="carregando" /> : cfg === null ? (
            <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
              Você ainda não salvou uma estratégia para {sym}. <Link to="/estrategia" className="font-medium text-primary underline">Criar agora ›</Link>
            </div>
          ) : (
            <Link to="/estrategia" className="block rounded-md border border-primary/40 p-3 hover:bg-secondary/40">
              <p className="text-sm font-semibold text-primary">✓ {preset ? preset.name : "Estratégia manual"} · {sym}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {describeStrategy(cfg, "BNB").map((l, i) => <li key={i}>• {l}</li>)}
                {(cfg.buyTaxPct || cfg.sellTaxPct) ? <li>• Taxa do token já considerada: {cfg.buyTaxPct ?? 0}% na compra e {cfg.sellTaxPct ?? 0}% na venda.</li> : null}
              </ul>
              <p className="mt-2 text-xs text-primary">Tocar para ver ou mudar a estratégia ›</p>
            </Link>
          ))}
          {mode === "grade" && (
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["lower_price", "Preço mínimo (BNB por token)"], ["upper_price", "Preço máximo (BNB por token)"], ["levels", "Número de faixas"], ["order_bnb", "BNB por ordem"],
                  ["max_slippage_pct", "Variação aceita (%)"], ["max_impact_pct", "Impacto máx. (%)"], ["gas_reserve_bnb", "Reserva para gás (BNB)"],
                ] as const).map(([k, l]) => (
                  <div key={k}>
                    <Label className="text-xs">{l}</Label>
                    <Input type="number" step="any" disabled={armed} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">A cada queda de uma faixa, compra o valor por ordem; a cada alta, vende o equivalente. Fora da faixa, para.</p>
              {lines.length > 0 && <p className="mt-2 break-words font-mono text-[10px] text-muted-foreground">{lines.map((p) => p.toExponential(3)).join(" · ")}</p>}
              <Button className="mt-3" size="sm" disabled={armed} onClick={() => save()}>Salvar grade</Button>
            </div>
          )}
        </Panel>

        <Panel title={`Situação do robô · ${sym}`}>
          <div className="space-y-2 text-sm">
            <div className={`rounded-md border p-3 ${armed ? "border-success/50 bg-success/10" : "border-border"}`}>
              <p className="font-semibold">{armed ? <span className="text-success">● LIGADO — operando sozinho</span> : <span className="text-muted-foreground">○ Desligado</span>}</p>
              {bot?.last_reason && <p className="mt-1 text-xs"><span className="text-muted-foreground">O que ele está pensando: </span>{bot.last_reason}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">Última verificação: {bot?.last_run_at ? new Date(bot.last_run_at).toLocaleString("pt-BR") : "ainda não verificou"}</p>
              {bot?.last_error && <p className="mt-1 text-xs text-destructive">Atenção: {bot.last_error}</p>}
            </div>
            {mode === "estrategia" ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Info label="Compras abertas" value={`${st.entries} de ${cfg?.maxEntries ?? "—"}`} />
                <Info label="Preço médio de compra" value={st.avgPriceUsd > 0 ? `US$ ${st.avgPriceUsd.toPrecision(4)}` : "sem posição"} />
                <Info label={`${sym} comprados`} value={st.tokens > 0 ? st.tokens.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0"} />
                <Info label="BNB investido" value={st.costBnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} />
                <Info label="Operações hoje" value={`${st.tradesToday} de ${cfg?.maxTradesPerDay ?? "—"}`} />
                <Info label="Último preço visto" value={bot?.last_price ? `US$ ${Number(bot.last_price).toPrecision(4)}` : "—"} />
              </div>
            ) : (
              <p className="text-xs">Faixa atual: {bot?.last_level ?? "—"} de {bot?.levels ?? "—"}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {armed
                ? <Button variant="destructive" onClick={() => save(false)}>Desligar robô</Button>
                : <Button disabled={!w?.address || (mode === "estrategia" && !cfg)} onClick={() => confirm(`Ligar o robô para ${sym}? Ele vai comprar e vender sozinho com dinheiro real, seguindo ${mode === "estrategia" ? "sua estratégia" : "a grade"}.`) && save(true)}>Ligar robô</Button>}
              <Button variant="secondary" disabled={busy || !bot} onClick={() => act(() => runNow({ data: { token } }), "Verificação feita")}>Verificar agora</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Ligado, ele confere a cada minuto. Cada compra ou venda chega no sininho 🔔 e no celular.</p>
          </div>
        </Panel>
      </div>

      <Panel title="Carteira do robô">
        {w === null ? <Unavailable reason="carregando" /> : w.address ? (
          <div className="space-y-1 text-sm">
            <p className="break-all font-mono text-xs">{w.address}</p>
            <div className="flex flex-wrap gap-2 py-1">
              <FundBotDialog botAddress={w.address} onDone={load} />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(w.address!); toast.success("Endereço copiado"); }}>Copiar endereço</Button>
              <a className="inline-flex items-center text-xs text-primary underline" href={`https://bscscan.com/address/${w.address}`} target="_blank" rel="noreferrer">Ver na BscScan</a>
            </div>
            <p>BNB: {bnb !== null ? <span className="font-mono">{bnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}</span> : <Unavailable reason="falha de consulta" />}</p>
            {bnb !== null && <p className={bnb < reserve ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{bnb < reserve ? `Saldo abaixo da reserva de gás (${reserve} BNB). Envie BNB para o robô poder operar.` : "Saldo suficiente para o gás."}</p>}
            {w.tokens.filter((t) => Number(t.amount) > 0).map((t) => <p key={t.symbol}>{t.symbol}: <span className="font-mono">{Number(t.amount).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span></p>)}
            <div className="mt-3 rounded-md border border-warning/50 bg-warning/10 p-3">
              <p className="font-semibold">↩️ Me arrependi — quero meu dinheiro de volta</p>
              <p className="mt-1 text-xs text-muted-foreground">A qualquer momento: o robô é <strong className="text-foreground">desligado na hora</strong>, os tokens que ele comprou e todo o BNB voltam para a carteira que você escolher abaixo (só fica o necessário para a taxa da rede). Os tokens voltam como tokens — se quiser BNB, venda-os depois em Operar.</p>
              {(() => {
                const ok = (c: { created_at?: string }) => !!c.created_at && Date.now() - new Date(c.created_at).getTime() >= 24 * 3600 * 1000;
                const eligible = saved.filter(ok);
                if (saved.length === 0) return <p className="mt-2 text-xs">Primeiro salve sua carteira em <Link to="/carteiras" className="text-primary underline">Minhas carteiras</Link>. Por segurança, ela poderá receber 24 horas depois.</p>;
                return (
                  <div className="mt-2 space-y-2">
                    <select className="w-full rounded-md border border-border bg-background p-2 text-sm" value={dest} onChange={(e) => setDest(e.target.value)}>
                      <option value="">Escolha para onde devolver…</option>
                      {saved.map((c) => <option key={c.id} value={c.address} disabled={!ok(c)}>{c.label || "Carteira"} · {c.address.slice(0, 6)}…{c.address.slice(-4)}{ok(c) ? "" : " (liberada 24h após salvar)"}</option>)}
                    </select>
                    {eligible.length === 0 && <p className="text-xs">Sua carteira foi salva há menos de 24 horas. Essa espera protege seu dinheiro caso alguém invada sua conta.</p>}
                    <Button className="w-full" variant="destructive" disabled={busy || !dest} onClick={() => confirm("Desligar o robô e devolver todo o saldo para a carteira escolhida?") && act(() => withdraw({ data: { to: dest } }), "Devolução enviada. Confira na sua carteira em alguns segundos.")}>Desligar e devolver tudo</Button>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <Button disabled={busy} onClick={() => act(() => createW(), "Carteira do robô criada")}>Criar carteira do robô</Button>
        )}
      </Panel>

      <Panel collapsible title={`Operações do robô (${orders.length})`}>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma operação ainda.</p> : orders.map((o) => (
          <div key={o.id} className="mb-2 rounded border border-border p-2 text-xs">
            <div className="flex flex-wrap justify-between gap-2">
              <span className={`rounded border px-1 font-semibold uppercase ${o.side === "compra" ? "border-success/50 text-success" : "border-destructive/50 text-destructive"}`}>{o.side} {tokens.find((t) => t.address.toLowerCase() === o.token.toLowerCase())?.symbol}</span>
              <span className="font-mono">{o.status}</span>
              <span className="text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
            </div>
            {o.tx_hash && <a className="break-all font-mono text-primary underline" href={`https://bscscan.com/tx/${o.tx_hash}`} target="_blank" rel="noreferrer">Ver na BscScan</a>}
            {o.error && <p className="text-destructive">{o.error}</p>}
          </div>
        ))}
      </Panel>

      <Panel collapsible title="Dúvidas comuns">
        <div className="space-y-3 text-sm">
          <Faq q="O robô usa a estratégia que eu salvei?">Sim. No modo "Minha estratégia" ele lê a estratégia salva do token a cada minuto. Se você mudar e salvar a estratégia, o robô passa a seguir a nova na próxima verificação.</Faq>
          <Faq q="Ele considera a taxa do token?">Sim. A taxa medida no contrato (ex.: 8% no GTE) é descontada do valor mínimo que ele aceita receber, e as metas de lucro da estratégia já estão ajustadas para o ganho depois da taxa.</Faq>
          <Faq q="Ele pode comprar sem parar?">Não. Ele respeita o máximo de compras, o limite de BNB investido, a pausa entre operações, o limite de operações por dia e o limite de perda do dia. Faz no máximo uma troca por minuto.</Faq>
          <Faq q="E se o preço não puder ser lido?">Ele espera. Sem preço confiável ele não compra nem vende.</Faq>
          <Faq q="A carteira do robô é real?">Sim. É um endereço de verdade na rede BSC, criado só para você. Toque em "Ver na BscScan" para conferir saldo e operações.</Faq>
          <Faq q="O robô pode mexer na minha carteira pessoal?">Não. Ele só usa o BNB que você enviar para a carteira dele. Sua carteira pessoal continua 100% sua.</Faq>
          <Faq q="Como paro tudo?">Toque em "Desligar robô". Para pegar o dinheiro de volta, use "Desligar e devolver tudo" na área Carteira do robô — dá para fazer a qualquer momento, até logo depois de enviar.</Faq>
        </div>
      </Panel>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-border p-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="truncate font-mono">{value}</p></div>;
}
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return <div><p className="font-medium">{q}</p><p className="text-xs text-muted-foreground">{children}</p></div>;
}
