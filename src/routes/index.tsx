import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { AppShell, Panel, Unavailable } from "@/components/AppShell";
import { GTE_ADDRESS, getMarket, validateToken } from "@/lib/chain.functions";
import { Button } from "@/components/ui/button";

const tokenQ = queryOptions({ queryKey: ["token"], queryFn: () => validateToken({ data: {} }), staleTime: 60_000 });
const marketQ = queryOptions({ queryKey: ["market"], queryFn: () => getMarket(), refetchInterval: 30_000 });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel GTE — Gold Tech na BNB Smart Chain" },
      { name: "description", content: "Validação on-chain, pools PancakeSwap, preço e liquidez do token GTE." },
      { property: "og:title", content: "Painel GTE — Gold Tech na BNB Smart Chain" },
      { property: "og:description", content: "Validação on-chain, pools PancakeSwap, preço e liquidez do token GTE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const EXPECTED = { chainId: "56", name: "Gold Tech", symbol: "GTE", decimals: "18" };

function Row({ label, value, expected, error }: { label: string; value: string | null; expected?: string; error?: string }) {
  const mismatch = expected && value !== null && value !== expected;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono">
        {value === null ? (
          <Unavailable reason={error ?? "sem resposta"} />
        ) : (
          <>
            {value}
            {expected && (
              <span className={mismatch ? "ml-2 text-destructive" : "ml-2 text-success"}>
                {mismatch ? `≠ esperado ${expected}` : "✓"}
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

function fmtUsd(n: number | null) {
  return n === null ? null : `US$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}

function Dashboard() {
  const token = useQuery(tokenQ);
  const market = useQuery(marketQ);
  const t = token.data;
  const supply =
    t?.totalSupplyRaw.value && t.decimals.value
      ? new Decimal(t.totalSupplyRaw.value).div(new Decimal(10).pow(t.decimals.value)).toFixed()
      : null;
  const best = market.data?.pools.find((p) => p.supported);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Gold Tech (GTE)</h1>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
          BNB Smart Chain · {GTE_ADDRESS}{" "}
          <a className="text-primary underline" href={`https://bscscan.com/token/${GTE_ADDRESS}`} target="_blank" rel="noreferrer">
            BscScan
          </a>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          title="Validação on-chain"
          right={
            <Button size="sm" variant="outline" onClick={() => token.refetch()} disabled={token.isFetching}>
              {token.isFetching ? "Consultando…" : "Revalidar"}
            </Button>
          }
        >
          {token.isError && <p className="text-sm text-destructive">Falha ao consultar o RPC.</p>}
          {t && (
            <>
              <Row label="Chain ID" value={t.chainId.value} expected={EXPECTED.chainId} error={t.chainId.error} />
              <Row label="Contrato possui bytecode" value={t.hasCode.value === null ? null : t.hasCode.value === "true" ? "sim" : "não"} expected="sim" error={t.hasCode.error} />
              <Row label="name()" value={t.name.value} expected={EXPECTED.name} error={t.name.error} />
              <Row label="symbol()" value={t.symbol.value} expected={EXPECTED.symbol} error={t.symbol.error} />
              <Row label="decimals()" value={t.decimals.value} expected={EXPECTED.decimals} error={t.decimals.error} />
              <Row label="totalSupply()" value={supply} error={t.totalSupplyRaw.error} />
              <Row label="Bloco consultado" value={t.block.value} error={t.block.error} />
              <p className="mt-2 text-xs text-muted-foreground">
                {t.rpc} · {new Date(t.checkedAt).toLocaleString("pt-BR")}. Metadados corretos não comprovam legitimidade ou segurança do token.
              </p>
            </>
          )}
        </Panel>

        <Panel title="Mercado selecionado">
          {market.data?.error && <p className="mb-2 text-sm text-destructive">Fonte de mercado falhou: {market.data.error}</p>}
          {market.data && !best && (
            <p className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              Aguardando pool e liquidez disponíveis. O monitoramento continua a cada 30s.
            </p>
          )}
          {best && (
            <div className="space-y-1">
              <Row label="Pool" value={`${best.baseSymbol}/${best.quoteSymbol} · ${best.dexId} ${best.version}`} />
              <Row label={`Preço em ${best.quoteSymbol}`} value={best.priceNative} error="não informado pela fonte" />
              <Row label="Preço em USD" value={best.priceUsd ? `US$ ${best.priceUsd}` : null} error="conversão indisponível" />
              <Row label="Liquidez (estimativa)" value={fmtUsd(best.liquidityUsd)} error="não informada" />
              <Row label="Volume 24h" value={fmtUsd(best.volume24h)} error="não informado" />
              <Row label="Variação 24h" value={best.priceChange24h === null ? null : `${best.priceChange24h}%`} error="não informada" />
              <p className="pt-2 text-xs text-muted-foreground">
                Sugestão por maior liquidez entre pools PancakeSwap V2. Todos os dados do mesmo pool. Fonte: {market.data?.source} ·{" "}
                {market.data && new Date(market.data.fetchedAt).toLocaleTimeString("pt-BR")}
              </p>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Pools encontrados">
          {market.isLoading && <p className="text-sm text-muted-foreground">Buscando…</p>}
          {market.data && market.data.pools.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pool encontrado pela fonte.</p>}
          <div className="space-y-2">
            {market.data?.pools.map((p) => (
              <div key={p.pairAddress} className="rounded border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {p.baseSymbol}/{p.quoteSymbol} · {p.dexId} {p.version}
                  </span>
                  <span className={p.supported ? "text-xs text-success" : "text-xs text-warning"}>
                    {p.supported ? "suportado" : "não suportado nesta versão"}
                  </span>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{p.pairAddress}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Liquidez: {fmtUsd(p.liquidityUsd) ?? "indisponível"} · Volume 24h: {fmtUsd(p.volume24h) ?? "indisponível"}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Anúncios não verificados do projeto">
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>Encerramento da pré-venda: 12/10/2026 · Lançamento: 14/10/2026 · Primeira “injeção”: 16/10/2026</li>
            <li>Preço de pré-venda anunciado: 0,00014 (moeda não confirmada) · Lançamento anunciado: US$ 0,0003</li>
            <li className="text-xs">Informativos apenas. Não são usados como gatilho nem como preço negociável.</li>
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
