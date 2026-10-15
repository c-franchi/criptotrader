import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Panel } from "@/components/AppShell";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { getMarket } from "@/lib/chain.functions";
import { getCandles } from "@/lib/history.functions";
import { backtest, windowStats } from "@/lib/backtest";
import { PRESETS, buildPreset } from "@/lib/presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/metricas")({
  head: () => ({
    meta: [
      { title: "Métricas de evolução — CryptoBot" },
      { name: "description", content: "Variação do token em 1h, 12h e 24h e quanto cada estratégia teria rendido." },
      { property: "og:title", content: "Métricas de evolução — CryptoBot" },
      { property: "og:description", content: "Variação do token em 1h, 12h e 24h e quanto cada estratégia teria rendido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell><Metrics /></AppShell>,
});

const WINDOWS = [{ h: 1, label: "1 hora" }, { h: 12, label: "12 horas" }, { h: 24, label: "24 horas" }];
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number) => (n > 0 ? "text-primary" : n < 0 ? "text-destructive" : "");
const usd = (n: number) => `US$ ${n < 0.01 ? n.toPrecision(4) : n.toFixed(4)}`;

function Metrics() {
  const { token, tokens, selectToken } = useSelectedToken();
  const [hours, setHours] = useState(24);
  const [amount, setAmount] = useState("1");
  const market = useQuery({ queryKey: ["market", token.address], queryFn: () => getMarket({ data: { address: token.address } }) });
  const pool = market.data?.pools.find((p) => p.supported)?.pairAddress ?? market.data?.pools[0]?.pairAddress;
  const candles = useQuery({ queryKey: ["candles", pool, token.address], enabled: !!pool, queryFn: () => { if (!pool) throw new Error("Pool indisponível"); return getCandles({ data: { pool, token: token.address } }); }, staleTime: 60_000, refetchInterval: 60_000, retry: 1, retryDelay: 5000 });

  const now = Date.now() / 1000;
  const win = (candles.data ?? []).filter((c) => c[0] >= now - hours * 3600);
  const stats = windowStats(win);
  const cap = Number(amount) || 0;
  const liq = market.data?.pools.find((p) => p.supported)?.liquidityUsd ?? null;

  return (
    <div className="space-y-4">
      <Panel title="Métricas de evolução">
        <div className="flex flex-wrap gap-2">
          {tokens.map((t) => (
            <Button key={t.address} size="sm" variant={t.address === token.address ? "default" : "outline"} onClick={() => selectToken(t.address)}>{t.symbol}</Button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {WINDOWS.map((w) => (
            <Button key={w.h} variant={hours === w.h ? "default" : "outline"} onClick={() => setHours(w.h)}>{w.label}</Button>
          ))}
        </div>
      </Panel>

      {market.isLoading || candles.isLoading ? (
        <Panel title="Carregando"><p className="text-sm text-muted-foreground">Buscando histórico de preço…</p></Panel>
      ) : !pool ? (
        <Panel title="Indisponível"><p className="text-sm text-muted-foreground">Sem pool PancakeSwap V2 confirmado para {token.symbol}, ou a consulta de mercado falhou.</p></Panel>
      ) : candles.error ? (
        <Panel title="Indisponível">
          <p className="text-sm text-destructive">Não foi possível ler o histórico agora. Tente de novo em instantes.</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => candles.refetch()}>Tentar novamente</Button>
        </Panel>
      ) : !stats ? (
        <Panel title="Sem negociações"><p className="text-sm text-muted-foreground">Nenhuma negociação de {token.symbol} nas últimas {hours}h.</p></Panel>
      ) : (
        <>
          <Panel title={`${token.symbol} nas últimas ${hours}h`}>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-muted-foreground">Variação</p><p className={`text-xl font-bold ${tone(stats.changePct)}`}>{pct(stats.changePct)}</p></div>
              <div><p className="text-muted-foreground">Maior alta</p><p className="text-xl font-bold text-primary">{pct(stats.maxRisePct)}</p></div>
              <div><p className="text-muted-foreground">Maior queda</p><p className="text-xl font-bold text-destructive">{pct(stats.maxDropPct)}</p></div>
              <div><p className="text-muted-foreground">Preço atual</p><p className="font-semibold">{usd(stats.close)}</p></div>
              <div><p className="text-muted-foreground">Abertura</p><p>{usd(stats.open)}</p></div>
              <div><p className="text-muted-foreground">Máxima</p><p>{usd(stats.high)}</p></div>
              <div><p className="text-muted-foreground">Mínima</p><p>{usd(stats.low)}</p></div>
              <div><p className="text-muted-foreground">Velas de 5 min</p><p>{win.length}</p></div>
            </div>
          </Panel>

          <Panel title="Quanto teria ganho">
            <Label>Valor aplicado (BNB)</Label>
            <Input type="number" step="any" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="mt-3 space-y-2">
              <Row name="Só comprar e segurar" pnlPct={stats.changePct} cap={cap} trades={1} />
              {PRESETS.map((p) => {
                const r = backtest(win, buildPreset(p.id, cap, liq), cap);
                return r ? <Row key={p.id} name={p.name} pnlPct={r.pnlPct} cap={cap} trades={r.trades} /> : null;
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Estimativa feita com o histórico de preço (velas de 5 min) e taxa de 0,25% por troca. Não inclui gás, slippage nem impacto de preço. Resultado passado não garante resultado futuro.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

function Row({ name, pnlPct, cap, trades }: { name: string; pnlPct: number; cap: number; trades: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
      <div><p className="font-medium">{name}</p><p className="text-xs text-muted-foreground">{trades} operação(ões)</p></div>
      <div className="text-right">
        <p className={`font-bold ${tone(pnlPct)}`}>{pct(pnlPct)}</p>
        <p className={`text-xs ${tone(pnlPct)}`}>{(cap * pnlPct / 100 >= 0 ? "+" : "")}{(cap * pnlPct / 100).toFixed(5)} BNB</p>
      </div>
    </div>
  );
}
