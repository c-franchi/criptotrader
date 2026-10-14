import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin, Unavailable } from "@/components/AppShell";
import { createBotWallet, getBotWallet, runGridNow, withdrawBot } from "@/lib/bot.functions";
import { TOKENS } from "@/lib/tokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/grade")({
  head: () => ({
    meta: [
      { title: "Grade automática — GTE Monitor" },
      { name: "description", content: "Robô de grade na PancakeSwap V2: compra nas quedas e vende nas altas usando uma carteira dedicada." },
      { property: "og:title", content: "Grade automática — GTE Monitor" },
      { property: "og:description", content: "Robô de grade na PancakeSwap V2 com carteira dedicada e botão de armar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequireLogin>
        <Grade />
      </RequireLogin>
    </AppShell>
  ),
});

type Bot = Tables<"grid_bots">;
type Wallet = Awaited<ReturnType<typeof getBotWallet>>;
const blank = { lower_price: "", upper_price: "", levels: "10", order_bnb: "0.01", max_slippage_pct: "3", max_impact_pct: "3", gas_reserve_bnb: "0.005" };

function Grade() {
  const { user } = useAuth();
  const getW = useServerFn(getBotWallet), createW = useServerFn(createBotWallet), withdraw = useServerFn(withdrawBot), runNow = useServerFn(runGridNow);
  const [token, setToken] = useState<string>(TOKENS[1]!.address);
  const [w, setW] = useState<Wallet | null>(null);
  const [bot, setBot] = useState<Bot | null>(null);
  const [f, setF] = useState(blank);
  const [orders, setOrders] = useState<Tables<"orders">[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    getW().then(setW).catch(() => setW({ address: null, bnb: null, tokens: [] }));
    const { data } = await supabase.from("grid_bots").select("*").eq("token", token).maybeSingle();
    setBot(data);
    setF(data ? Object.fromEntries(Object.keys(blank).map((k) => [k, String((data as any)[k])])) as typeof blank : blank);
    const { data: o } = await supabase.from("orders").select("*").eq("source", "grade").order("created_at", { ascending: false }).limit(20);
    setOrders(o ?? []);
  }, [token, getW]);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const save = async (armed?: boolean) => {
    if (!user) return;
    const lo = Number(f.lower_price), hi = Number(f.upper_price), lv = Number(f.levels), ob = Number(f.order_bnb);
    if (!(hi > lo && lo > 0)) return void toast.error("Preço máximo precisa ser maior que o mínimo");
    if (!(lv >= 2 && lv <= 100) || !(ob > 0)) return void toast.error("Revise níveis e valor por ordem");
    if (armed && !w?.address) return void toast.error("Crie a carteira do robô antes de armar");
    const row = {
      user_id: user.id, token, lower_price: lo, upper_price: hi, levels: lv, order_bnb: ob,
      max_slippage_pct: Number(f.max_slippage_pct), max_impact_pct: Number(f.max_impact_pct), gas_reserve_bnb: Number(f.gas_reserve_bnb),
      armed: armed ?? bot?.armed ?? false, updated_at: new Date().toISOString(),
      ...(bot && (bot.lower_price !== lo || bot.upper_price !== hi || bot.levels !== lv) ? { last_level: null } : {}),
    };
    const { error } = await supabase.from("grid_bots").upsert(row, { onConflict: "user_id,token" });
    if (error) return void toast.error("Não foi possível salvar");
    await supabase.from("audit_log").insert({ user_id: user.id, action: armed === undefined ? "grid_saved" : armed ? "grid_armed" : "grid_disarmed", details: row });
    toast.success(armed === undefined ? "Grade salva" : armed ? "Grade ARMADA" : "Grade desarmada");
    load();
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); load(); }
  };

  const sym = TOKENS.find((t) => t.address === token)!.symbol;
  const lo = Number(f.lower_price), hi = Number(f.upper_price), lv = Number(f.levels);
  const lines = hi > lo && lv >= 2 && lv <= 100 ? Array.from({ length: lv + 1 }, (_, i) => lo + (i * (hi - lo)) / lv) : [];

  return (
    <div className="space-y-4">
      <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <strong>Modo AUTOMÁTICO — operações reais sem confirmação.</strong> Quando armada, a grade compra e vende sozinha com a carteira do robô. Deposite só o que aceita perder. Tokens com pouca liquidez podem travar ou não permitir venda.
      </div>

      <div className="flex flex-wrap gap-2">
        {TOKENS.map((t) => (
          <Button key={t.address} size="sm" variant={t.address === token ? "default" : "secondary"} onClick={() => setToken(t.address)}>{t.symbol}</Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Carteira do robô">
          {w === null ? <Unavailable reason="carregando" /> : w.address ? (
            <div className="space-y-1 text-sm">
              <p className="break-all font-mono text-xs">{w.address}</p>
              <p>BNB: {w.bnb !== null ? <span className="font-mono">{Number(w.bnb).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}</span> : <Unavailable reason="falha de consulta" />}</p>
              {w.tokens.map((t) => <p key={t.symbol}>{t.symbol}: <span className="font-mono">{Number(t.amount).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span></p>)}
              <p className="text-xs text-muted-foreground">Envie BNB para este endereço para a grade poder comprar. A chave fica criptografada no servidor e nunca é mostrada.</p>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm("Desarmar e enviar todo o saldo para a carteira cadastrada em Estratégia?") && act(() => withdraw(), "Saque enviado")}>Sacar tudo</Button>
            </div>
          ) : (
            <Button disabled={busy} onClick={() => act(() => createW(), "Carteira do robô criada")}>Criar carteira do robô</Button>
          )}
        </Panel>

        <Panel title={`Status da grade ${sym}`}>
          <div className="space-y-1 text-sm">
            <p>Estado: {bot?.armed ? <span className="font-semibold text-success">ARMADA</span> : <span className="text-muted-foreground">desarmada</span>}</p>
            <p>Último preço: {bot?.last_price ? <span className="font-mono">{Number(bot.last_price).toExponential(4)} BNB</span> : <Unavailable reason="ainda não executou" />}</p>
            <p>Faixa atual: {bot?.last_level ?? "—"} de {bot?.levels ?? "—"}</p>
            <p>Última verificação: {bot?.last_run_at ? new Date(bot.last_run_at).toLocaleString("pt-BR") : "—"}</p>
            {bot?.last_error && <p className="text-destructive">{bot.last_error}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              {bot?.armed
                ? <Button variant="destructive" onClick={() => save(false)}>Desarmar</Button>
                : <Button onClick={() => confirm("Armar a grade? Ela vai operar sozinha com dinheiro real.") && save(true)}>Armar grade</Button>}
              <Button variant="secondary" disabled={busy || !bot} onClick={() => act(() => runNow({ data: { token } }), "Verificação executada")}>Verificar agora</Button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Configuração">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["lower_price", "Preço mínimo (BNB por token)"], ["upper_price", "Preço máximo (BNB por token)"], ["levels", "Número de faixas"], ["order_bnb", "BNB por ordem"],
            ["max_slippage_pct", "Slippage máx. (%)"], ["max_impact_pct", "Impacto máx. (%)"], ["gas_reserve_bnb", "Reserva para gas (BNB)"],
          ] as const).map(([k, l]) => (
            <div key={k}>
              <Label>{l}</Label>
              <Input type="number" step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">A cada queda de uma faixa, compra o valor por ordem; a cada alta, vende o equivalente. Fora da faixa, não opera mais. Mudar a faixa reinicia a referência.</p>
        {lines.length > 0 && <p className="mt-2 break-words font-mono text-[10px] text-muted-foreground">{lines.map((p) => p.toExponential(3)).join(" · ")}</p>}
        <Button className="mt-3" onClick={() => save()}>Salvar</Button>
      </Panel>

      <Panel title="Ordens da grade">
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ordem.</p> : orders.map((o) => (
          <div key={o.id} className="mb-2 rounded border border-border p-2 text-xs">
            <div className="flex flex-wrap justify-between gap-2">
              <span className={o.side === "compra" ? "text-success" : "text-destructive"}>{o.side} {TOKENS.find((t) => t.address.toLowerCase() === o.token.toLowerCase())?.symbol}</span>
              <span className="font-mono">{o.status}</span>
              <span className="text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
            </div>
            {o.tx_hash && <a className="break-all font-mono text-primary underline" href={`https://bscscan.com/tx/${o.tx_hash}`} target="_blank" rel="noreferrer">{o.tx_hash}</a>}
            {o.error && <p className="text-destructive">{o.error}</p>}
          </div>
        ))}
      </Panel>
    </div>
  );
}
