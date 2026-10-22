import { formatUsd } from "@/lib/display";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, Panel } from "@/components/AppShell";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { getMarket } from "@/lib/chain.functions";
import { useCandles } from "@/hooks/useCandles";
import { windowStats } from "@/lib/marketStats";
import { Button } from "@/components/ui/button";
import { CandleChart } from "@/components/CandleChart";

export const Route = createFileRoute("/metricas")({
  head: () => ({
    meta: [
      { title: "Métricas de evolução — CryptoBot" },
      {
        name: "description",
        content: "Variação do token em 1h, 12h e 24h e histórico de preços.",
      },
      { property: "og:title", content: "Métricas de evolução — CryptoBot" },
      {
        property: "og:description",
        content: "Variação do token em 1h, 12h e 24h e histórico de preços.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Metrics />
    </AppShell>
  ),
});

const WINDOWS = [
  { h: 1, label: "1 hora" },
  { h: 12, label: "12 horas" },
  { h: 24, label: "24 horas" },
];
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number) => (n > 0 ? "text-primary" : n < 0 ? "text-destructive" : "");
const usd = formatUsd;

function Metrics() {
  const { token, tokens, selectToken } = useSelectedToken();
  const [hours, setHours] = useState(24);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const market = useQuery({
    queryKey: ["market", token.address],
    queryFn: () => getMarket({ data: { address: token.address } }),
  });
  const pool =
    market.data?.pools.find((p) => p.supported)?.pairAddress ?? market.data?.pools[0]?.pairAddress;
  const candles = useCandles(pool, token.address);

  const now = clock / 1000;
  const win = (candles.data ?? []).filter((c) => c[0] >= now - hours * 3600);
  const stats = windowStats(win);

  return (
    <div className="space-y-4">
      <Panel title="Métricas de evolução">
        <div className="flex flex-wrap gap-2">
          {tokens.map((t) => (
            <Button
              key={t.address}
              size="sm"
              variant={t.address === token.address ? "default" : "outline"}
              onClick={() => selectToken(t.address)}
            >
              {t.symbol}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {WINDOWS.map((w) => (
            <Button
              key={w.h}
              variant={hours === w.h ? "default" : "outline"}
              onClick={() => setHours(w.h)}
            >
              {w.label}
            </Button>
          ))}
        </div>
      </Panel>

      {market.isLoading || candles.isLoading ? (
        <Panel title="Carregando">
          <p className="text-sm text-muted-foreground">Buscando histórico de preço…</p>
        </Panel>
      ) : !pool ? (
        <Panel title="Indisponível">
          <p className="text-sm text-muted-foreground">
            Sem pool PancakeSwap V2 confirmado para {token.symbol}, ou a consulta de mercado falhou.
          </p>
        </Panel>
      ) : candles.error ? (
        <Panel title="Indisponível">
          <p className="text-sm text-destructive">
            Não foi possível ler o histórico agora. Tente de novo em instantes.
          </p>
          <Button className="mt-3" variant="outline" size="sm" onClick={() => candles.refetch()}>
            Tentar novamente
          </Button>
        </Panel>
      ) : !stats ? (
        <Panel title="Sem negociações">
          <p className="text-sm text-muted-foreground">
            Nenhuma negociação de {token.symbol} nas últimas {hours}h.
          </p>
        </Panel>
      ) : (
        <>
          <Panel title={`${token.symbol} nas últimas ${hours}h`}>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Variação</p>
                <p className={`text-xl font-bold ${tone(stats.changePct)}`}>
                  {pct(stats.changePct)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Maior alta</p>
                <p className="text-xl font-bold text-primary">{pct(stats.maxRisePct)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Maior queda</p>
                <p className="text-xl font-bold text-destructive">{pct(stats.maxDropPct)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Preço atual</p>
                <p className="font-semibold">{usd(stats.close)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Abertura</p>
                <p>{usd(stats.open)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Máxima</p>
                <p>{usd(stats.high)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Mínima</p>
                <p>{usd(stats.low)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Velas de 5 min</p>
                <p>{win.length}</p>
              </div>
            </div>
          </Panel>

          <CandleChart
            key={token.address}
            candles={candles.data ?? []}
            now={clock}
            strategyMinutes={15}
          />
        </>
      )}
    </div>
  );
}
