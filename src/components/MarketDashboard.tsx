import { useQuery } from "@tanstack/react-query";
import { getMarket } from "@/lib/chain.functions";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { formatUsd } from "@/lib/display";
import { TokenPicker } from "./TokenPicker";
import { TokenChart } from "./TokenChart";
import { FiatValue } from "@/hooks/useCurrency";
import { Button } from "./ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ExternalLink } from "lucide-react";

export function MarketDashboard() {
  const { token, tokens, selectToken } = useSelectedToken();
  const market = useQuery({
    queryKey: ["market", token.address],
    queryFn: () => getMarket({ data: { address: token.address } }),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });
  const pool = market.data?.pools.find((p) => p.supported) ?? market.data?.pools[0];
  const raw = Number(pool?.priceUsd);
  const price = Number.isFinite(raw) && raw > 0 ? raw : null;
  const change = pool?.priceChange24h;
  return (
    <section aria-label="Mercado do token selecionado" className="dashboard-market mb-6 border-b border-border">
      <aside className="dashboard-token space-y-5">
        <TokenPicker tokens={tokens} value={token.address} onChange={selectToken} label="Token do Painel" />
        <div>
          <p className="text-sm text-muted-foreground">Preço de {token.symbol}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{price == null ? "Indisponível" : formatUsd(price)}</p>
          <FiatValue usd={price} hideUsdDuplicate />
          <p className={change == null ? "mt-2 text-sm text-muted-foreground" : change >= 0 ? "mt-2 text-sm font-semibold text-success" : "mt-2 text-sm font-semibold text-destructive"}>
            {change == null ? "Variação em 24h indisponível" : `${change >= 0 ? "+" : ""}${change.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · 24h`}
          </p>
        </div>
        <dl className="divide-y divide-border text-sm">
          {[["Liquidez do pool", pool?.liquidityUsd], ["Volume em 24h", pool?.volume24h]].map(([label, value]) => (
            <div key={String(label)} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-semibold tabular-nums">
                {typeof value === "number" && Number.isFinite(value) ? <>{formatUsd(value)}<FiatValue usd={value} hideUsdDuplicate /></> : "Indisponível"}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-2 py-3"><dt className="text-muted-foreground">Rede</dt><dd>BNB Smart Chain</dd></div>
          <div className="flex justify-between gap-2 py-3"><dt className="text-muted-foreground">Mercado</dt><dd className="text-right">{pool?.dexId ?? "Indisponível"}</dd></div>
        </dl>
        <a href={`https://bscscan.com/token/${token.address}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary" title={token.address}>
          <ExternalLink className="size-4 shrink-0" /><span>Contrato · {token.address.slice(0, 6)}…{token.address.slice(-4)}</span>
        </a>
        <Button variant="outline" asChild className="w-full"><Link to="/operar" search={{ token: token.address }}>Operar {token.symbol}<ArrowUpRight className="size-4" /></Link></Button>
      </aside>
      <div className="dashboard-chart min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <h1 className="text-lg font-semibold">Gráfico · {token.symbol}</h1>
          <Button variant="ghost" size="sm" asChild><Link to="/metricas">Métricas avançadas<ArrowUpRight className="size-4" /></Link></Button>
        </div>
        <TokenChart address={token.address} symbol={token.symbol} showHeading={false} />
      </div>
    </section>
  );
}