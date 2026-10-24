import { FiatValue } from "@/hooks/useCurrency";
import { TokenPicker } from "@/components/TokenPicker";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { getTradingMarket } from "@/lib/chain.functions";
import { useCandles } from "@/hooks/useCandles";
import { formatUsd } from "@/lib/display";
import { chartWindow } from "@/lib/chart";
import type { TokenInfo } from "@/lib/tokens";
import { CandleChart } from "./CandleChart";
import { Button } from "./ui/button";

export function TradeMarket({
  token,
  tokens,
  onSelect,
  onSide,
  disabled,
  extra,
  strategyMinutes = 15,
  rulesVersion = 1,
  showActions = true,
}: {
  token: TokenInfo;
  tokens: TokenInfo[];
  onSelect: (address: string) => void;
  onSide: (side: "compra" | "venda") => void;
  disabled: boolean;
  extra?: React.ReactNode;
  strategyMinutes?: number;
  rulesVersion?: 1 | 2;
  showActions?: boolean;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(timer);
  }, []);
  const market = useQuery({
    queryKey: ["trading-market", token.address],
    queryFn: () => getTradingMarket({ data: { address: token.address } }),
    staleTime: 2000,
    refetchInterval: 3000,
    retry: 1,
  });
  const pool = market.data?.pools.find((p) => p.supported);
  const candles = useCandles(pool?.pairAddress, token.address);
  const at = Date.parse(market.data?.fetchedAt ?? "");
  const price = Number(pool?.priceUsd);
  const fresh =
    Number.isFinite(price) &&
    price > 0 &&
    !market.isError &&
    !market.data?.error &&
    now - at <= 15000;
  const window = chartWindow(candles.data ?? [], now, 86400000);
  const change =
    fresh && window.covered && window.baseline ? (price / window.baseline - 1) * 100 : null;
  return (
    <section className="bg-card py-3" aria-label={`Negociar ${token.symbol}`}>
      <div className="flex items-start justify-between gap-3">
        <TokenPicker
          tokens={tokens}
          value={token.address}
          onChange={onSelect}
          disabled={disabled}
          label="Token para comprar ou vender"
        />
        <div className="min-w-0 text-right">
          <p className="text-xl font-bold tracking-tight sm:text-3xl">
            {price > 0 ? formatUsd(price) : "Consultando…"}
          </p>
          {price > 0 && <FiatValue usd={price} hideUsdDuplicate />}
          <p
            className={
              change == null
                ? "text-muted-foreground text-xs"
                : change >= 0
                  ? "text-success text-sm"
                  : "text-destructive text-sm"
            }
          >
            {change == null
              ? "Variação em 24h indisponível"
              : `${change >= 0 ? "+" : ""}${change.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · 24h`}
          </p>
        </div>
      </div>
      <div className="my-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {fresh ? "Cotação atual" : "Cotação não confirmada"}
          {Number.isFinite(at) ? ` · ${new Date(at).toLocaleTimeString("pt-BR")}` : ""}
        </span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Atualizar mercado"
          disabled={market.isFetching}
          onClick={() => {
            void market.refetch();
            void candles.refetch();
          }}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <div className="mx-auto w-full">
        <CandleChart
          key={token.address}
          compact
          strategyMinutes={strategyMinutes}
          rulesVersion={rulesVersion}
          candles={candles.data ?? []}
          now={now}
          liveQuote={fresh ? { price, at } : undefined}
        />
      </div>
      {!fresh && (
        <p role="status" className="mt-2 text-sm text-warning">
          Aguardando uma cotação atual do par BNB. Confira a cotação da operação antes de assinar.
        </p>
      )}
      <details className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Sobre {token.symbol}</summary>
        <p className="mt-2">
          {token.name} · BNB Smart Chain. Compra: paga BNB e recebe {token.symbol}. Venda: entrega{" "}
          {token.symbol} e recebe BNB.
        </p>
        <p className="mt-1 break-all">Contrato: {token.address}</p>
        <p className="mt-1">
          Cotação a cada 3s; histórico a cada 30s. Velas e médias mantêm os dados históricos reais.
        </p>
        {extra}
      </details>
      {showActions && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button
              size="lg"
              disabled={disabled}
              className="min-h-14 rounded-full bg-emerald-700 text-white hover:bg-emerald-800"
              onClick={() => onSide("compra")}
            >
              Comprar {token.symbol} <ArrowDownLeft />
            </Button>
            <Button
              size="lg"
              disabled={disabled}
              className="min-h-14 rounded-full"
              variant="destructive"
              onClick={() => onSide("venda")}
            >
              Vender {token.symbol} <ArrowUpRight />
            </Button>
          </div>
        </>
      )}
      {showActions && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Escolha a operação para informar os valores e revisar.
        </p>
      )}
    </section>
  );
}
