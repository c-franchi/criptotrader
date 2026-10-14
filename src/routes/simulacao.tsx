import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import Decimal from "decimal.js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin, Unavailable } from "@/components/AppShell";
import { getMarket } from "@/lib/chain.functions";
import { DEFAULT_ASSUMPTIONS, avgPrice, simBuy, simSell, type SimState } from "@/lib/sim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/simulacao")({
  head: () => ({
    meta: [
      { title: "Simulação — GTE Monitor" },
      { name: "description", content: "Carteira simulada persistente para testar compras e vendas de GTE sem transações reais." },
      { property: "og:title", content: "Simulação — GTE Monitor" },
      { property: "og:description", content: "Carteira simulada persistente para testar compras e vendas de GTE sem transações reais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequireLogin>
        <Sim />
      </RequireLogin>
    </AppShell>
  ),
});

type Account = Tables<"sim_accounts">;
type Trade = Tables<"sim_trades">;
const D = (v: string | number) => new Decimal(v);
const toState = (a: Account): SimState => ({
  quote: D(a.quote_balance), tokens: D(a.token_balance), costBasis: D(a.cost_basis), realized: D(a.realized_pnl), fees: D(a.fees_paid),
});

function Sim() {
  const { user } = useAuth();
  const market = useQuery({ queryKey: ["market"], queryFn: () => getMarket(), refetchInterval: 30_000 });
  const pool = market.data?.pools.find((p) => p.supported);
  const price = pool?.priceNative ? D(pool.priceNative) : null;

  const [acc, setAcc] = useState<Account | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [initial, setInitial] = useState("1");
  const [spend, setSpend] = useState("");
  const [sellPct, setSellPct] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("sim_accounts").select("*").eq("archived", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setAcc(data);
    if (data) {
      const { data: t } = await supabase.from("sim_trades").select("*").eq("account_id", data.id).order("created_at", { ascending: false });
      setTrades(t ?? []);
    } else setTrades([]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!user || !D(initial || 0).gt(0)) return toast.error("Informe um saldo inicial maior que zero");
    const { error } = await supabase.from("sim_accounts").insert({
      user_id: user.id, quote_symbol: pool?.quoteSymbol ?? "WBNB", initial_quote: initial, quote_balance: initial,
    } as never);
    if (error) return toast.error(error.message);
    load();
  };

  const persist = async (next: SimState, side: "compra" | "venda", r: { tokens: Decimal; fee: Decimal; realized: Decimal }, quoteAmt: Decimal) => {
    if (!acc || !user || !price) return;
    const { error } = await supabase.from("sim_accounts").update({
      quote_balance: next.quote.toString(), token_balance: next.tokens.toString(), cost_basis: next.costBasis.toString(),
      realized_pnl: next.realized.toString(), fees_paid: next.fees.toString(),
    } as never).eq("id", acc.id);
    if (error) return toast.error(error.message);
    await supabase.from("sim_trades").insert({
      user_id: user.id, account_id: acc.id, side, price: price.toString(), quote_amount: quoteAmt.toString(),
      token_amount: r.tokens.toString(), fee: r.fee.toString(), gas_estimate: DEFAULT_ASSUMPTIONS.gasQuote,
      slippage_pct: DEFAULT_ASSUMPTIONS.slippagePct, realized_pnl: r.realized.toString(), reason: "manual", pair_address: pool?.pairAddress,
    } as never);
    toast.success(`Operação SIMULADA de ${side} registrada`);
    load();
  };

  const buy = () => {
    if (!acc || !price) return;
    try {
      const amt = D(spend || 0);
      if (!amt.gt(0)) throw new Error("Valor inválido");
      const r = simBuy(toState(acc), amt, price, DEFAULT_ASSUMPTIONS);
      persist(r.next, "compra", r, amt);
    } catch (e) { toast.error((e as Error).message); }
  };
  const sell = () => {
    if (!acc || !price) return;
    try {
      const pct = D(sellPct || 0);
      if (!pct.gt(0) || pct.gt(100)) throw new Error("Percentual entre 0 e 100");
      const r = simSell(toState(acc), pct, price, DEFAULT_ASSUMPTIONS);
      persist(r.next, "venda", r, r.proceeds);
    } catch (e) { toast.error((e as Error).message); }
  };

  const reset = async () => {
    if (!acc || !confirm("Arquivar esta simulação e começar outra? O histórico será preservado.")) return;
    await supabase.from("sim_accounts").update({ archived: true }).eq("id", acc.id);
    load();
  };

  const exportCsv = () => {
    const head = "data,lado,preco,valor_moeda,quantidade_gte,taxa,gas_estimado,slippage_pct,resultado_realizado";
    const rows = trades.map((t) => [t.created_at, t.side, t.price, t.quote_amount, t.token_amount, t.fee, t.gas_estimate, t.slippage_pct, t.realized_pnl].join(","));
    const url = URL.createObjectURL(new Blob([[head, ...rows].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "simulacao-gte.csv"; a.click(); URL.revokeObjectURL(url);
  };

  if (!acc)
    return (
      <Panel title="Nova carteira simulada">
        <Label>Saldo inicial ({pool?.quoteSymbol ?? "WBNB"})</Label>
        <div className="mt-1 flex gap-2">
          <Input type="number" step="any" value={initial} onChange={(e) => setInitial(e.target.value)} />
          <Button onClick={create}>Criar</Button>
        </div>
      </Panel>
    );

  const s = toState(acc);
  const avg = avgPrice(s);
  const unrealized = price && s.tokens.gt(0) ? s.tokens.mul(price).minus(s.costBasis) : null;
  const sells = trades.filter((t) => t.side === "venda");
  const wins = sells.filter((t) => D(t.realized_pnl).gt(0)).length;
  const q = acc.quote_symbol;

  return (
    <div className="space-y-4">
      <div className="rounded border border-primary/40 bg-accent p-3 text-sm text-accent-foreground">
        Simulação: nenhuma transação real. Custos estimados: taxa DEX {DEFAULT_ASSUMPTIONS.dexFeePct}%, slippage {DEFAULT_ASSUMPTIONS.slippagePct}%, gas {DEFAULT_ASSUMPTIONS.gasQuote} {q}. Taxas do token desconhecidas (não aplicadas). Não comprova que uma operação real será possível.
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Saldos">
          <p className="font-mono text-sm">{s.quote.toSignificantDigits(8).toString()} {q}</p>
          <p className="font-mono text-sm">{s.tokens.toSignificantDigits(10).toString()} GTE</p>
          <p className="mt-2 text-xs text-muted-foreground">Inicial: {acc.initial_quote} {q}</p>
        </Panel>
        <Panel title="Posição">
          <p className="text-sm">Preço médio: {avg ? <span className="font-mono">{avg.toSignificantDigits(8).toString()}</span> : <Unavailable reason="sem posição" />}</p>
          <p className="text-sm">Preço atual: {price ? <span className="font-mono">{price.toString()}</span> : <Unavailable reason="sem pool suportado" />}</p>
          <p className="text-sm">Não realizado: {unrealized ? <span className="font-mono">{unrealized.toSignificantDigits(6).toString()} {q}</span> : <Unavailable reason="sem posição ou preço" />}</p>
        </Panel>
        <Panel title="Resultado">
          <p className="text-sm">Realizado: <span className="font-mono">{s.realized.toSignificantDigits(6).toString()} {q}</span></p>
          <p className="text-sm">Custos acumulados: <span className="font-mono">{s.fees.toSignificantDigits(6).toString()} {q}</span></p>
          <p className="text-sm">Operações: {trades.length} · Acerto: {sells.length ? `${Math.round((wins / sells.length) * 100)}%` : "indisponível"}</p>
        </Panel>
      </div>

      <Panel title="Operar (simulado)">
        {!price && <p className="mb-3 text-sm text-warning">Aguardando pool e liquidez disponíveis. Operações simuladas bloqueadas sem preço real.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Gastar ({q})</Label>
            <div className="mt-1 flex gap-2">
              <Input type="number" step="any" value={spend} onChange={(e) => setSpend(e.target.value)} />
              <Button onClick={buy} disabled={!price}>Simular compra</Button>
            </div>
          </div>
          <div>
            <Label>Vender % da posição remanescente</Label>
            <div className="mt-1 flex gap-2">
              <Input type="number" step="any" value={sellPct} onChange={(e) => setSellPct(e.target.value)} />
              <Button variant="secondary" onClick={sell} disabled={!price}>Simular venda</Button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Histórico" right={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={exportCsv} disabled={!trades.length}>CSV</Button><Button size="sm" variant="ghost" onClick={reset}>Reiniciar</Button></div>}>
        {trades.length === 0 ? <p className="text-sm text-muted-foreground">Sem operações.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground"><tr><th className="py-1">Data</th><th>Lado</th><th>Preço</th><th>{q}</th><th>GTE</th><th>Resultado</th></tr></thead>
              <tbody className="font-mono">
                {trades.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-1">{new Date(t.created_at).toLocaleString("pt-BR")}</td>
                    <td className={t.side === "compra" ? "text-success" : "text-destructive"}>{t.side}</td>
                    <td>{D(t.price).toSignificantDigits(6).toString()}</td>
                    <td>{D(t.quote_amount).toSignificantDigits(6).toString()}</td>
                    <td>{D(t.token_amount).toSignificantDigits(6).toString()}</td>
                    <td>{t.side === "venda" ? D(t.realized_pnl).toSignificantDigits(6).toString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
