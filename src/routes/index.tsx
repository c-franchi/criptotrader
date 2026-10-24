import { FundsOverview } from "@/components/FundsOverview";
import { PageHeading } from "@/components/PageHeading";
import { FiatValue } from "@/hooks/useCurrency";
import { TokenPicker } from "@/components/TokenPicker";
import { useEffect, useState } from "react";
import { formatPrice, formatUsd } from "@/lib/display";
import { TokenChart } from "@/components/TokenChart";
import { Link, createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { AppShell, Panel, Unavailable } from "@/components/AppShell";
import { AddTokenDialog } from "@/components/AddTokenDialog";
import { StrategyAlert } from "@/components/StrategyAlert";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { getMarket, validateToken } from "@/lib/chain.functions";
import { getTransfers } from "@/lib/transfers.functions";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/HelpTip";

const tokenQ = (a: string) =>
  queryOptions({
    queryKey: ["token", a],
    queryFn: () => validateToken({ data: { address: a } }),
    staleTime: 60_000,
  });
const marketQ = (a: string) =>
  queryOptions({
    queryKey: ["market", a],
    queryFn: () => getMarket({ data: { address: a } }),
    refetchInterval: 30_000,
  });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de tokens — CryptoBot" },
      {
        name: "description",
        content: "Preços, liquidez e validação dos tokens selecionados na BNB Smart Chain.",
      },
      { property: "og:title", content: "Painel de tokens — CryptoBot" },
      {
        property: "og:description",
        content: "Preços, liquidez e validação dos tokens selecionados na BNB Smart Chain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Row({
  label,
  value,
  expected,
  error,
}: {
  label: string;
  value: string | null;
  expected?: string | undefined;
  error?: string | undefined;
}) {
  const mismatch = expected && value !== null && value !== expected;
  return (
    <div className="flex items-baseline justify-between gap-3 min-w-0 border-b border-border/60 py-1.5 text-sm last:border-0">
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
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    try {
      setAdvanced(localStorage.getItem("cryptobot:dashboard-advanced") === "1");
    } catch {
      /* disabled */
    }
  }, []);
  const toggleAdvanced = () => {
    setAdvanced((v) => {
      try {
        localStorage.setItem("cryptobot:dashboard-advanced", v ? "0" : "1");
      } catch {
        /* disabled */
      }
      return !v;
    });
  };
  const { token: info, selectToken: setAddr, ready, tokens } = useSelectedToken();
  const addr = info.address;
  const EXPECTED = {
    chainId: "56",
    name: info.name,
    symbol: info.symbol,
    decimals: String(info.decimals),
  };
  const token = useQuery({ ...tokenQ(addr), enabled: ready });
  const market = useQuery({ ...marketQ(addr), enabled: ready });
  const t = token.data;
  const supply =
    t?.totalSupplyRaw.value && t.decimals.value
      ? new Decimal(t.totalSupplyRaw.value).div(new Decimal(10).pow(t.decimals.value)).toFixed()
      : null;
  const best = market.data?.pools.find((p) => p.supported);

  const pool = best?.pairAddress.toLowerCase();
  const transfers = useQuery({
    queryKey: ["transfers", addr, pool ?? ""],
    queryFn: () =>
      getTransfers({
        data: { address: addr, ...(pool && /^0x[0-9a-f]{40}$/.test(pool) ? { pool } : {}) },
      }),
    enabled: ready && !market.isLoading,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const fmtAmt = (raw: string) =>
    new Decimal(raw)
      .div(new Decimal(10).pow(info.decimals))
      .toSignificantDigits(6)
      .toNumber()
      .toLocaleString("pt-BR", { maximumSignificantDigits: 6 });

  return (
    <AppShell>
      <PageHeading title="Painel" description="Seus fundos, robôs e mercado." />
      <FundsOverview />
      <div data-token-picker className="mb-4 flex flex-wrap gap-2">
        <TokenPicker tokens={tokens} value={addr} onChange={setAddr} />
        <AddTokenDialog />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Preço e gráfico em destaque · detalhes do mercado abaixo
        </p>
        <Button variant="outline" size="sm" aria-pressed={advanced} onClick={toggleAdvanced}>
          {advanced ? "Modo avançado · voltar ao básico" : "Modo básico · abrir detalhes avançados"}
        </Button>
      </div>
      <StrategyAlert address={addr} symbol={info.symbol} pools={market.data?.pools ?? []} />

      <section className="mb-4 border-b border-border bg-card py-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="min-w-0 truncate text-lg font-semibold sm:text-2xl">
            {info.name} <span className="text-muted-foreground">({info.symbol})</span>
          </h2>
          <a
            className="shrink-0 text-xs text-primary underline"
            href={`https://bscscan.com/token/${addr}`}
            target="_blank"
            rel="noreferrer"
          >
            BscScan
          </a>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{addr}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Stat label="Preço USD" value={best?.priceUsd ? formatUsd(best.priceUsd) : null} />
            <FiatValue usd={best?.priceUsd} hideUsdDuplicate />
          </div>
          <Stat
            label={`Preço ${best?.quoteSymbol ?? "BNB"}`}
            value={best?.priceNative ? formatPrice(best.priceNative) : null}
          />
          <div>
            <Stat label="Liquidez" value={fmtUsd(best?.liquidityUsd ?? null)} />
            <FiatValue usd={best?.liquidityUsd} hideUsdDuplicate />
          </div>
          <Stat
            label="Variação 24h"
            value={best?.priceChange24h == null ? null : `${best.priceChange24h}%`}
            tone={
              best?.priceChange24h == null
                ? undefined
                : best.priceChange24h >= 0
                  ? "text-success"
                  : "text-destructive"
            }
          />
        </div>
        {market.isLoading && (
          <p className="mt-3 text-xs text-muted-foreground">Buscando mercado…</p>
        )}
        {market.data?.error && (
          <p className="mt-3 text-xs text-destructive">
            Fonte de mercado falhou: {market.data.error}
          </p>
        )}
        {market.data && !market.data.error && !best && (
          <p className="mt-3 rounded border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
            Aguardando pool e liquidez disponíveis. Atualiza a cada 30s.
          </p>
        )}
        {best && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {best.baseSymbol}/{best.quoteSymbol} · {best.dexId} {best.version} · Vol. 24h{" "}
            {fmtUsd(best.volume24h) ?? "indisponível"} · {market.data?.source}{" "}
            {market.data && new Date(market.data.fetchedAt).toLocaleTimeString("pt-BR")}
          </p>
        )}
      </section>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to="/estrategia">Configurar estratégia</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/grade">Acompanhar robô</Link>
        </Button>
      </div>
      {!advanced && (
        <p className="mb-3 text-xs text-muted-foreground">
          Transferências, validação do contrato e pools estão no modo avançado.
        </p>
      )}
      <div className="mb-4">
        <TokenChart address={addr} symbol={info.symbol} />
      </div>
      <div className={advanced ? "grid gap-4 md:grid-cols-2" : "hidden"}>
        <Panel
          collapsible
          title={`Transferências recentes (${transfers.data?.transfers.length ?? 0})`}
          right={
            <span className="text-[11px] text-muted-foreground">
              Holders: {transfers.data?.holders ?? "—"}
            </span>
          }
        >
          {transfers.isLoading && <p className="text-sm text-muted-foreground">Buscando…</p>}
          {transfers.data?.error && (
            <p className="text-sm text-muted-foreground">
              Falha na consulta de transferências. Tente atualizar em instantes.
            </p>
          )}
          {transfers.data && !transfers.data.error && transfers.data.transfers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma transferência nos últimos ~
              {transfers.data.scannedBlocks.toLocaleString("pt-BR")} blocos.
            </p>
          )}
          <p className="mb-1 text-[11px] text-muted-foreground">
            <span className="text-success">Compra</span> = saiu do pool para alguém ·{" "}
            <span className="text-destructive">Venda</span> = entrou no pool.
          </p>
          <ul className="divide-y divide-border/60">
            {transfers.data?.transfers.map((t, i) => (
              <li key={t.hash + i} className="flex items-center justify-between gap-2 py-2 text-xs">
                {(() => {
                  const kind =
                    pool && t.from.toLowerCase() === pool
                      ? "compra"
                      : pool && t.to.toLowerCase() === pool
                        ? "venda"
                        : "transf.";
                  const tone =
                    kind === "compra"
                      ? "border-success/50 bg-success/15 text-success"
                      : kind === "venda"
                        ? "border-destructive/50 bg-destructive/15 text-destructive"
                        : "border-border text-muted-foreground";
                  return (
                    <>
                      <span
                        className={`w-14 shrink-0 rounded border px-1 py-0.5 text-center text-[10px] font-semibold uppercase ${tone}`}
                      >
                        {kind}
                      </span>
                      <a
                        href={`https://bscscan.com/tx/${t.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate font-mono text-muted-foreground hover:text-primary"
                      >
                        {short(t.from)} → {short(t.to)}
                      </a>
                      <span
                        className={`shrink-0 font-mono ${kind === "compra" ? "text-success" : kind === "venda" ? "text-destructive" : ""}`}
                      >
                        {fmtAmt(t.amountRaw)}
                      </span>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
          {transfers.data && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Fonte: rede BSC (direto) · atualiza sozinho a cada 30s ·{" "}
              {new Date(transfers.data.fetchedAt).toLocaleTimeString("pt-BR")}
              {transfers.isFetching && " · atualizando…"}
            </p>
          )}
        </Panel>

        <Panel
          collapsible
          title={`Top 10 carteiras que mais negociam`}
          right={
            <HelpTip title="O que é este ranking?">
              Lista as carteiras que mais compraram e venderam este token no pool da PancakeSwap nas
              últimas horas. Muitas compras e vendas indicam quem está fazendo trade. Não é
              recomendação: grandes carteiras podem ser do próprio projeto, robôs ou corretoras.
            </HelpTip>
          }
        >
          {!pool && (
            <p className="text-sm text-muted-foreground">
              Ranking indisponível: sem pool conhecido para este token.
            </p>
          )}
          {pool &&
            transfers.data &&
            transfers.data.ranking.length === 0 &&
            !transfers.data.error && (
              <p className="text-sm text-muted-foreground">
                Nenhuma compra ou venda no período lido.
              </p>
            )}
          {transfers.data && transfers.data.ranking.length > 0 && (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Baseado em {transfers.data.rankedTransfers} movimentações dos últimos ~
                {transfers.data.scannedBlocks.toLocaleString("pt-BR")} blocos. Ordenado pelo volume
                em {info.symbol}.
              </p>
              <ol className="divide-y divide-border/60">
                {transfers.data.ranking.map((w, i) => {
                  const net = BigInt(w.boughtRaw) - BigInt(w.soldRaw);
                  const profile =
                    w.buys > 0 && w.sells > 0
                      ? { t: "TRADER", c: "border-primary/50 bg-primary/15 text-primary" }
                      : w.buys > 0
                        ? { t: "COMPRADOR", c: "border-success/50 bg-success/15 text-success" }
                        : {
                            t: "VENDEDOR",
                            c: "border-destructive/50 bg-destructive/15 text-destructive",
                          };
                  return (
                    <li key={w.wallet} className="py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 shrink-0 font-mono font-bold text-primary">
                          {i + 1}º
                        </span>
                        <a
                          href={`https://bscscan.com/address/${w.wallet}`}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate font-mono hover:text-primary"
                        >
                          {short(w.wallet)}
                        </a>
                        <span
                          className={`shrink-0 rounded border px-1 py-0.5 text-[10px] font-semibold ${profile.c}`}
                        >
                          {profile.t}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 pl-7 text-[11px] text-muted-foreground">
                        <span className="text-success">
                          {w.buys} compras · {fmtAmt(w.boughtRaw)}
                        </span>
                        <span className="text-destructive">
                          {w.sells} vendas · {fmtAmt(w.soldRaw)}
                        </span>
                        <span>
                          Saldo do período:{" "}
                          <span className={net >= 0n ? "text-success" : "text-destructive"}>
                            {net >= 0n ? "+" : "−"}
                            {fmtAmt((net < 0n ? -net : net).toString())}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </Panel>

        <Panel
          title="Validação on-chain"
          right={
            <Button
              size="sm"
              variant="outline"
              onClick={() => token.refetch()}
              disabled={token.isFetching}
            >
              {token.isFetching ? "…" : "Revalidar"}
            </Button>
          }
        >
          {token.isError && <p className="text-sm text-destructive">Falha ao consultar o RPC.</p>}
          {t && (
            <details>
              <summary className="cursor-pointer text-sm">
                {[
                  t.name.value === EXPECTED.name,
                  t.symbol.value === EXPECTED.symbol,
                  t.decimals.value === EXPECTED.decimals,
                  t.chainId.value === EXPECTED.chainId,
                ].every(Boolean) ? (
                  <span className="text-success">✓ Contrato confere</span>
                ) : (
                  <span className="text-warning">Verifique os detalhes</span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">ver detalhes</span>
              </summary>
              <div className="mt-2">
                <Row
                  label="Chain ID"
                  value={t.chainId.value}
                  expected={EXPECTED.chainId}
                  error={t.chainId.error}
                />
                <Row
                  label="Bytecode"
                  value={
                    t.hasCode.value === null ? null : t.hasCode.value === "true" ? "sim" : "não"
                  }
                  expected="sim"
                  error={t.hasCode.error}
                />
                <Row
                  label="Nome"
                  value={t.name.value}
                  expected={EXPECTED.name}
                  error={t.name.error}
                />
                <Row
                  label="Símbolo"
                  value={t.symbol.value}
                  expected={EXPECTED.symbol}
                  error={t.symbol.error}
                />
                <Row
                  label="Decimais"
                  value={t.decimals.value}
                  expected={EXPECTED.decimals}
                  error={t.decimals.error}
                />
                <Row label="Supply total" value={supply} error={t.totalSupplyRaw.error} />
                <Row label="Bloco" value={t.block.value} error={t.block.error} />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Metadados corretos não comprovam legitimidade ou segurança do token.
                </p>
              </div>
            </details>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel collapsible title={`Pools e rota de execução (${market.data?.pools.length ?? 0})`}>
          {market.data?.error && !best && (
            <p className="text-sm text-muted-foreground">
              Pools indisponíveis; a falha não confirma ausência de liquidez.
            </p>
          )}
          <div className="space-y-2">
            {[...(market.data?.pools ?? [])]
              .sort((a, b) => Number(b.supported) - Number(a.supported))
              .map((p) => (
                <div key={p.pairAddress} className="rounded border border-border p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">
                      {p.baseSymbol}/{p.quoteSymbol} · {p.dexId} {p.version}
                    </span>
                    <span
                      className={p.supported ? "shrink-0 text-success" : "shrink-0 text-warning"}
                    >
                      {p.supported ? "rota WBNB operável" : "consulta apenas"}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Liq. {fmtUsd(p.liquidityUsd) ?? "indisponível"} · Vol.{" "}
                    {fmtUsd(p.volume24h) ?? "indisponível"}
                  </p>
                </div>
              ))}
          </div>
        </Panel>
        <Panel collapsible title="Anúncios históricos não verificados">
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Datas e preços anunciados (informativos)</summary>
            <ul className="mt-2 space-y-1">
              <li>Pré-venda até 12/10/2026 · Lançamento 14/10/2026 · “Injeção” 16/10/2026</li>
              <li>Pré-venda anunciada: 0,00014 (moeda não confirmada) · Lançamento: US$ 0,0003</li>
              <li>Não são usados como gatilho nem como preço negociável.</li>
            </ul>
          </details>
        </Panel>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`truncate font-mono text-base font-semibold ${value === null ? "text-muted-foreground" : (tone ?? "")}`}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}
