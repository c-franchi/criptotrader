import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import Decimal from "decimal.js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { AppShell, Panel, RequireLogin, Unavailable } from "@/components/AppShell";
import { getMarket } from "@/lib/chain.functions";
import { createSimulation, archiveSimulation, tradeSimulation } from "@/lib/simulation.functions";
import { DEFAULT_ASSUMPTIONS, avgPrice, simBuy, simSell, type SimState } from "@/lib/sim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/simulacao")({
  head: () => ({
    meta: [
      { title: "Simulação — CryptoBot" },
      {
        name: "description",
        content:
          "Carteira simulada persistente para testar compras e vendas de tokens sem transações reais.",
      },
      { property: "og:title", content: "Simulação — CryptoBot" },
      {
        property: "og:description",
        content:
          "Carteira simulada persistente para testar compras e vendas de tokens sem transações reais.",
      },
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
  quote: D(a.quote_balance),
  tokens: D(a.token_balance),
  costBasis: D(a.cost_basis),
  realized: D(a.realized_pnl),
  fees: D(a.fees_paid),
});

function Sim() {
  const { user } = useAuth();
  const { token } = useSelectedToken();
  const market = useQuery({
    queryKey: ["market", token.address],
    queryFn: () => getMarket({ data: { address: token.address } }),
    refetchInterval: 30_000,
  });
  const pool = market.data?.pools.find((p) => p.supported);
  const price = pool?.priceNative ? D(pool.priceNative) : null;

  const [busy, setBusy] = useState(false);
  const [acc, setAcc] = useState<Account | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [initial, setInitial] = useState("1");
  const [spend, setSpend] = useState("");
  const [sellPct, setSellPct] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("sim_accounts")
      .select("*")
      .eq("archived", false)
      .eq("token", token.address.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAcc(data);
    if (data) {
      const { data: t } = await supabase
        .from("sim_trades")
        .select("*")
        .eq("account_id", data.id)
        .order("created_at", { ascending: false });
      setTrades(t ?? []);
    } else setTrades([]);
  }, [token.address]);
  useEffect(() => {
    setAcc(null);
    setTrades([]);
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    act(() => createSimulation({ data: { token: token.address, amount: initial } }));
  const trade = (side: "compra" | "venda") =>
    act(async () => {
      if (!acc) return;
      await tradeSimulation({
        data: {
          id: acc.id,
          revision: acc.revision,
          requestId: crypto.randomUUID(),
          token: token.address,
          side,
          amount: side === "compra" ? spend : sellPct,
        },
      });
      toast.success(`Operação SIMULADA de ${side} registrada`);
    });
  const buy = () => trade("compra");
  const sell = () => trade("venda");
  const reset = () => {
    if (!acc || !confirm("Arquivar esta simulação? O histórico será preservado.")) return;
    void act(() => archiveSimulation({ data: { id: acc.id } }));
  };

  const exportCsv = () => {
    const head =
      "data,lado,preco,valor_moeda,quantidade_token,taxa,gas_estimado,slippage_pct,resultado_realizado";
    const rows = trades.map((t) =>
      [
        t.created_at,
        t.side,
        t.price,
        t.quote_amount,
        t.token_amount,
        t.fee,
        t.gas_estimate,
        t.slippage_pct,
        t.realized_pnl,
      ].join(","),
    );
    const url = URL.createObjectURL(new Blob([[head, ...rows].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulacao-${token.symbol}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!acc)
    return (
      <div className="space-y-4">
        <LegacySimulations />
        <Panel title={`Nova simulação de ${token.symbol}`}>
          <p className="mb-3 text-xs text-muted-foreground">
            Cada token tem saldo e histórico próprios. Simulações antigas sem identificação do ativo
            permanecem preservadas no banco e não são reutilizadas.
          </p>
          <Label>Saldo inicial ({pool?.quoteSymbol ?? "WBNB"})</Label>
          <div className="mt-1 flex gap-2">
            <Input
              type="number"
              step="any"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
            />
            <Button onClick={create} disabled={busy}>
              Criar
            </Button>
          </div>
        </Panel>
      </div>
    );

  const s = toState(acc);
  const avg = avgPrice(s);
  const unrealized = price && s.tokens.gt(0) ? s.tokens.mul(price).minus(s.costBasis) : null;
  const sells = trades.filter((t) => t.side === "venda");
  const wins = sells.filter((t) => D(t.realized_pnl).gt(0)).length;
  const q = acc.quote_symbol;

  return (
    <div className="space-y-4">
      <LegacySimulations />
      <div className="rounded border border-primary/40 bg-accent p-3 text-sm text-accent-foreground">
        Simulação: nenhuma transação real. Custos estimados: taxa DEX{" "}
        {DEFAULT_ASSUMPTIONS.dexFeePct}%, slippage {DEFAULT_ASSUMPTIONS.slippagePct}%, gas{" "}
        {DEFAULT_ASSUMPTIONS.gasQuote} {q}. As operações usam as taxas salvas na estratégia ou
        conhecidas pelo sistema; taxas não verificadas continuam estimativas. Não comprova que uma
        operação real será possível.
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Saldos">
          <p className="font-mono text-sm">
            {s.quote.toSignificantDigits(8).toString()} {q}
          </p>
          <p className="font-mono text-sm">
            {s.tokens.toSignificantDigits(10).toString()} {token.symbol}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Inicial: {acc.initial_quote} {q}
          </p>
        </Panel>
        <Panel title="Posição">
          <p className="text-sm">
            Preço médio:{" "}
            {avg ? (
              <span className="font-mono">{avg.toSignificantDigits(8).toString()}</span>
            ) : (
              <Unavailable reason="sem posição" />
            )}
          </p>
          <p className="text-sm">
            Preço atual:{" "}
            {price ? (
              <span className="font-mono">{price.toString()}</span>
            ) : (
              <Unavailable reason="sem pool suportado" />
            )}
          </p>
          <p className="text-sm">
            Não realizado:{" "}
            {unrealized ? (
              <span className="font-mono">
                {unrealized.toSignificantDigits(6).toString()} {q}
              </span>
            ) : (
              <Unavailable reason="sem posição ou preço" />
            )}
          </p>
        </Panel>
        <Panel title="Resultado">
          <p className="text-sm">
            Realizado:{" "}
            <span className="font-mono">
              {s.realized.toSignificantDigits(6).toString()} {q}
            </span>
          </p>
          <p className="text-sm">
            Custos acumulados:{" "}
            <span className="font-mono">
              {s.fees.toSignificantDigits(6).toString()} {q}
            </span>
          </p>
          <p className="text-sm">
            Operações: {trades.length} · Acerto:{" "}
            {sells.length ? `${Math.round((wins / sells.length) * 100)}%` : "indisponível"}
          </p>
        </Panel>
      </div>

      <Panel title="Operar (simulado)">
        {!price && (
          <p className="mb-3 text-sm text-warning">
            Aguardando pool e liquidez disponíveis. Operações simuladas bloqueadas sem preço real.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Gastar ({q})</Label>
            <div className="mt-1 flex gap-2">
              <Input
                type="number"
                step="any"
                value={spend}
                onChange={(e) => setSpend(e.target.value)}
              />
              <Button onClick={buy} disabled={!price || busy}>
                Simular compra
              </Button>
            </div>
          </div>
          <div>
            <Label>Vender % da posição remanescente</Label>
            <div className="mt-1 flex gap-2">
              <Input
                type="number"
                step="any"
                value={sellPct}
                onChange={(e) => setSellPct(e.target.value)}
              />
              <Button variant="secondary" onClick={sell} disabled={!price || busy}>
                Simular venda
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Histórico"
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!trades.length}>
              CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              Reiniciar
            </Button>
          </div>
        }
      >
        {trades.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem operações.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1">Data</th>
                  <th>Lado</th>
                  <th>Preço</th>
                  <th>{q}</th>
                  <th>{token.symbol}</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {trades.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-1">{new Date(t.created_at).toLocaleString("pt-BR")}</td>
                    <td className={t.side === "compra" ? "text-success" : "text-destructive"}>
                      {t.side}
                    </td>
                    <td>{D(t.price).toSignificantDigits(6).toString()}</td>
                    <td>{D(t.quote_amount).toSignificantDigits(6).toString()}</td>
                    <td>{D(t.token_amount).toSignificantDigits(6).toString()}</td>
                    <td>
                      {t.side === "venda"
                        ? D(t.realized_pnl).toSignificantDigits(6).toString()
                        : "—"}
                    </td>
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

function LegacySimulations() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<Trade[]>([]);
  useEffect(() => {
    let active = true;
    void supabase
      .from("sim_accounts")
      .select("*")
      .is("token", null)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (active) setAccounts(data ?? []);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!accounts.length) return null;
  return (
    <Panel collapsible title="Simulações anteriores · somente leitura">
      <p className="mb-3 text-xs text-warning">
        O ativo não era registrado nas contas antigas. Os saldos foram preservados e não serão
        convertidos nem atribuídos a outro token.
      </p>
      {accounts.map((a) => (
        <div className="mb-2 rounded border border-border p-2 text-xs" key={a.id}>
          <p>
            {new Date(a.created_at).toLocaleString("pt-BR")} · saldo {a.quote_balance}{" "}
            {a.quote_symbol} · tokens {a.token_balance}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const { data } = await supabase
                .from("sim_trades")
                .select("*")
                .eq("account_id", a.id)
                .order("created_at", { ascending: false })
                .limit(100);
              setHistory(data ?? []);
            }}
          >
            Consultar operações
          </Button>
        </div>
      ))}
      {history.map((t) => (
        <p key={t.id} className="border-t border-border py-2 text-xs">
          {new Date(t.created_at).toLocaleString("pt-BR")} · {t.side} · {t.token_amount} tokens ·{" "}
          {t.quote_amount} · {t.pair_address ?? "pool não registrado"}
        </p>
      ))}
    </Panel>
  );
}
