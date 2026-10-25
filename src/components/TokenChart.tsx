import { FiatValue } from "@/hooks/useCurrency";
import { formatUsd } from "@/lib/display";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { getMarket } from "@/lib/chain.functions";
import { useCandles } from "@/hooks/useCandles";
import { chartWindow } from "@/lib/chart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CandleChart } from "@/components/CandleChart";

const PERIODS = [
  { id: "1H", ms: 3_600_000 },
  { id: "4H", ms: 4 * 3_600_000 },
  { id: "12H", ms: 12 * 3_600_000 },
  { id: "1D", ms: 24 * 3_600_000 },
] as const;
const usd = formatUsd;
const time = (n: number) =>
  new Date(n).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function TokenChart(props: {
  address: string;
  symbol: string;
  strategyMinutes?: number;
  rulesVersion?: 1 | 2;
  showHeading?: boolean;
}) {
  return <PriceChart key={props.address} {...props} />;
}

function PriceChart({
  address,
  symbol,
  strategyMinutes = 15,
  rulesVersion = 1,
  showHeading = true,
}: {
  address: string;
  symbol: string;
  strategyMinutes?: number;
  rulesVersion?: 1 | 2;
  showHeading?: boolean;
}) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("1D");
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const market = useQuery({
    queryKey: ["market", address],
    queryFn: () => getMarket({ data: { address } }),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });
  const pools = market.data?.pools ?? [];
  const pool = (market.data?.pools.find((p) => p.supported) ?? market.data?.pools[0])?.pairAddress;
  const candles = useCandles(pool, address);
  const ms = PERIODS.find((p) => p.id === period)?.ms ?? 86_400_000;
  const all = candles.data ?? [];
  const { baseline, covered } = chartWindow(all, now, ms);
  const currentPool = pools.find((p) => p.pairAddress.toLowerCase() === pool?.toLowerCase());
  const rawPrice = Number(currentPool?.priceUsd);
  const live = rawPrice > 0 && Number.isFinite(rawPrice) ? rawPrice : null;
  const last = all.at(-1);
  const price = live ?? last?.[4] ?? null;
  const change = covered && baseline != null && price != null ? (price / baseline - 1) * 100 : null;
  const up = (change ?? 0) >= 0;
  const fetching = market.isFetching || candles.isFetching;
  const stale =
    market.isError ||
    !!market.data?.error ||
    (!!market.data?.fetchedAt && now - Date.parse(market.data.fetchedAt) > 120_000) ||
    candles.isError ||
    (!!last && now - (last[0] + 300) * 1000 > 600000);
  const refresh = () => {
    void market.refetch();
    if (pool) void candles.refetch();
  };
  return (
    <section aria-label={`Gráfico de ${symbol}`} className="border-b border-border bg-card py-5">
      {showHeading && <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-all text-xl font-bold">{symbol}</p>
        <div className="min-w-0 text-right">
          <p className="break-words font-mono text-xl font-bold">
            {price != null ? usd(price) : "—"}
          </p>
          <FiatValue usd={price} hideUsdDuplicate />
          <p
            className={cn(
              "text-sm font-medium",
              change == null ? "text-muted-foreground" : up ? "text-success" : "text-destructive",
            )}
          >
            {change != null
              ? `${up ? "+" : ""}${change.toFixed(2)}% · ${period}`
              : "Variação indisponível"}
          </p>
          {live == null && last && (
            <p className="text-xs text-warning">
              Último preço do histórico · {time(last[0] * 1000)}
            </p>
          )}
        </div>
      </div>}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {market.data
            ? `Consulta: ${time(Date.parse(market.data.fetchedAt))}`
            : "Consultando preço…"}
        </span>
        <Button
          aria-label="Atualizar preço e gráfico"
          title="Atualizar preço e gráfico"
          variant="ghost"
          size="icon"
          disabled={fetching}
          onClick={refresh}
          className="h-7 w-7"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", fetching && "motion-safe:animate-spin")} />
        </Button>
      </div>
      <div role="status" className="mt-2 flex flex-wrap gap-2 text-xs">
        <span
          className={stale ? "text-warning" : fetching ? "text-muted-foreground" : "text-success"}
        >
          {stale
            ? "Dados antigos ou fonte indisponível"
            : fetching
              ? "Atualizando"
              : last
                ? "Atualizado"
                : "Aguardando dados"}
        </span>
        {last && <span>Última vela: {time(last[0] * 1000)} · abertura da vela de 5m</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Preço: consulta a cada 15s · Histórico: a cada 30s
      </p>
      {!all.length && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-md border border-border bg-secondary/30 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            {(market.isFetching || candles.isFetching) && (
              <RefreshCw className="h-4 w-4 motion-safe:animate-spin" />
            )}
            {!pool && market.isFetching
              ? `Localizando o mercado de ${symbol}…`
              : pool && candles.isFetching
                ? `Carregando o gráfico de ${symbol}…`
                : pool && candles.isError
                  ? "Não foi possível carregar o histórico."
                  : pool
                    ? "Este mercado ainda não retornou velas."
                    : "Não encontramos um mercado com histórico para este ativo."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {candles.failureCount > 0
              ? "A fonte demorou ou falhou. Estamos tentando novamente; você pode aguardar ou atualizar."
              : "Buscamos o histórico do pool na fonte de mercado. Na primeira consulta isso pode levar alguns segundos; limites da fonte podem aumentar a espera."}
          </p>
        </div>
      )}
      {all.length > 0 && fetching && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Atualizando dados; o gráfico anterior deste ativo continua visível.
        </p>
      )}
      <div className="mt-3">
        {all.length > 0 && (
          <CandleChart
            compact
            preferenceKey="cryptobot:panel-chart-view"
            history={candles.history}
            candles={all}
            now={now}
            strategyMinutes={strategyMinutes}
            rulesVersion={rulesVersion}
          />
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Variação da cotação</p>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {PERIODS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={period === p.id ? "secondary" : "ghost"}
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
          >
            {p.id}
          </Button>
        ))}
      </div>
      {stale && all.length > 0 && (
        <p role="status" className="mt-2 text-xs text-warning">
          Atualização indisponível. Os últimos dados recebidos foram mantidos; tentando novamente.
        </p>
      )}
      {last && now - last[0] * 1000 > 20 * 60_000 && (
        <p role="status" className="mt-2 text-xs text-warning">
          Gráfico com dados até {time(last[0] * 1000)} — buscando atualização. O preço acima é
          atualizado separadamente quando a fonte responde.
        </p>
      )}
      {all.length > 0 && !covered && (
        <p className="mt-2 text-xs text-muted-foreground">Histórico parcial neste período.</p>
      )}
    </section>
  );
}
