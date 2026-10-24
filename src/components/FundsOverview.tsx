import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Wallet } from "lucide-react";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { useCurrency } from "@/hooks/currencyContext";
import { FiatValue } from "@/hooks/useCurrency";
import { fiatEstimate, formatFiat } from "@/lib/fiat";
import { getFundsOverview } from "@/lib/fundsOverview.functions";
import { fundsTotal, formatFundAmount, fundAssetValue } from "@/lib/fundsOverview";
import { Panel } from "./AppShell";
import { Button } from "./ui/button";
export function FundsOverview() {
  const { user } = useAuth();
  const { tokens } = useSelectedToken();
  const { walletScope, name } = useSelectedWallet();
  const { currency, quote } = useCurrency();
  const client = useQueryClient();
  const [view, setView] = useState<"all" | "selected">("all");
  const q = useQuery({
    queryKey: ["funds-overview", user?.id],
    enabled: !!user,
    queryFn: () => getFundsOverview(),
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["funds-overview", user?.id] });
    };
    window.addEventListener("wallets-changed", refresh);
    return () => window.removeEventListener("wallets-changed", refresh);
  }, [client, user?.id]);
  if (!user) return null;
  const wallets = (q.data?.wallets ?? []).filter(
    (w) => view === "all" || w.scopes.includes(walletScope),
  );
  const total = fundsTotal(wallets);
  const local = (value: string | null) => {
    const amount = fiatEstimate(value, "BNB", currency, quote);
    return value == null
      ? "Não apurado"
      : amount == null
        ? `${formatFundAmount(value, 10)} BNB`
        : formatFiat(amount, currency);
  };
  const bnb = (value: string | null, estimated = false) =>
    value == null
      ? "Indisponível"
      : `${estimated ? "≈ " : ""}${formatFundAmount(value, estimated ? 10 : undefined)} BNB`;
  return (
    <div className="mb-5" data-funds-overview>
      <Panel
        title="Seus fundos"
        right={
          <Button
            size="sm"
            variant="outline"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {q.isFetching ? "Atualizando…" : "Atualizar saldos"}
          </Button>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Carteiras do total">
          <Button
            size="sm"
            variant={view === "all" ? "default" : "outline"}
            aria-pressed={view === "all"}
            onClick={() => setView("all")}
          >
            Todas as carteiras
          </Button>
          <Button
            size="sm"
            variant={view === "selected" ? "default" : "outline"}
            aria-pressed={view === "selected"}
            onClick={() => setView("selected")}
          >
            {name}
          </Button>
        </div>
        {q.isError && (
          <p role="alert" className="mb-3 text-sm text-warning">
            Não foi possível atualizar os saldos.
            {q.data ? " Abaixo está a última consulta, com seu horário." : " Tente novamente."}
          </p>
        )}
        {!q.data ? (
          <p role="status" className="text-sm text-muted-foreground">
            {q.isPending ? "Consultando carteiras e robôs na rede…" : "Saldos indisponíveis."}
          </p>
        ) : (
          <>
            <div className="rounded-2xl bg-primary/5 p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">
                {total.complete
                  ? q.isError
                    ? "Último total consultado"
                    : "Total de fundos · estimativa"
                  : "Consulta parcial · subtotal apurado"}
              </p>
              <p className="mt-1 break-words text-3xl font-bold tracking-tight text-primary">
                {local(total.total ?? total.known)}
              </p>
              <p className="mt-1 break-all text-sm tabular-nums">
                {fiatEstimate(total.total ?? total.known, "BNB", currency, quote) == null
                  ? `Conversão para ${currency} indisponível`
                  : bnb(total.total ?? total.known, true)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Carteiras cadastradas + robôs · BSC. Confira os tokens e seus valores abaixo.
              </p>
            </div>
            {!total.complete && (
              <p role="status" className="mt-3 text-sm text-warning">
                Há saldo ou tokens sem consulta/cotação. O total completo ainda está indisponível; o
                subtotal soma apenas valores apurados.
              </p>
            )}
            <div className="mt-5 space-y-6">
              {wallets.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma carteira neste grupo. Cadastre uma carteira ou crie a carteira dos robôs.
                </p>
              )}
              {[false, true].map((robot) => {
                const group = wallets.filter((w) => w.bot === robot);
                if (!group.length) return null;
                const Icon = robot ? Bot : Wallet;
                return (
                  <section
                    key={String(robot)}
                    aria-label={robot ? "Carteiras dos robôs" : "Suas carteiras"}
                  >
                    <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                      {robot ? "Carteiras dos robôs" : "Suas carteiras"}
                    </h3>
                    <div className="space-y-4">
                      {group.map((w) => {
                        const subtotal = fundsTotal([w]);
                        const assets = [
                          {
                            address: "native",
                            symbol: "BNB",
                            amount: w.bnb,
                            value: w.bnb,
                            name: "BNB",
                          },
                          ...w.assets.map((a) => ({
                            ...a,
                            value: fundAssetValue(a),
                            name:
                              tokens.find(
                                (t) => t.address.toLowerCase() === a.address.toLowerCase(),
                              )?.name ?? a.symbol,
                          })),
                        ];
                        return (
                          <article
                            key={w.address}
                            className="overflow-hidden rounded-2xl border border-border"
                            aria-label={`${w.label} · tokens`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3 bg-muted/40 p-4">
                              <div className="min-w-0">
                                <h4 className="font-semibold">{w.label}</h4>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {w.bot ? "Saldo da carteira dos robôs" : "Carteira pessoal"}
                                  {w.bot && w.personal ? " · também cadastrada como pessoal" : ""}
                                </p>
                                <a
                                  href={`https://bscscan.com/address/${w.address}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-block font-mono text-xs text-muted-foreground underline"
                                  title={w.address}
                                >
                                  {w.address.slice(0, 6)}…{w.address.slice(-4)} ↗
                                </a>
                              </div>
                              <div className="min-w-0 text-right">
                                <p className="text-xs text-muted-foreground">
                                  {subtotal.complete ? "Valor da carteira" : "Subtotal apurado"}
                                </p>
                                <p className="mt-1 break-words text-xl font-bold tabular-nums">
                                  {local(subtotal.total ?? subtotal.known)}
                                </p>
                              </div>
                            </div>
                            <div className="px-4">
                              <p className="pt-4 text-sm font-semibold">
                                {w.bot ? "Tokens na carteira dos robôs" : "Tokens"}
                              </p>
                              <ul className="divide-y divide-border">
                                {assets.map((a) => (
                                  <li key={a.address} className="flex items-center gap-3 py-4">
                                    <span
                                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${a.address === "native" ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary"}`}
                                      aria-hidden="true"
                                    >
                                      {a.symbol.slice(0, 3)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="break-words text-sm font-semibold">{a.name}</p>
                                      <p
                                        className="mt-1 break-all text-xs tabular-nums text-muted-foreground"
                                        title={
                                          a.amount == null ? undefined : `${a.amount} ${a.symbol}`
                                        }
                                      >
                                        {a.amount == null
                                          ? "Saldo indisponível"
                                          : formatFundAmount(a.amount, 10)}{" "}
                                        {a.symbol}
                                      </p>
                                    </div>
                                    <div className="min-w-0 max-w-[48%] text-right">
                                      <p className="break-words text-base font-semibold tabular-nums">
                                        {local(a.value)}
                                      </p>
                                      <p className="mt-1 break-words text-xs text-muted-foreground">
                                        {a.value == null
                                          ? "Cotação ou saldo indisponível"
                                          : "Valor estimado"}
                                      </p>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <details className="mx-4 mb-4 border-t border-border pt-3">
                              <summary className="cursor-pointer text-sm text-muted-foreground">
                                Reservas e detalhes da carteira
                              </summary>
                              <a
                                href={`https://bscscan.com/address/${w.address}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 block break-all font-mono text-xs text-primary underline"
                              >
                                {w.address}
                              </a>
                              {w.capital && (
                                <dl className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                                  <div className="flex flex-wrap justify-between gap-1">
                                    <dt>Reserva planejada para compras</dt>
                                    <dd className="break-all text-right">
                                      {bnb(w.capital.reserved)}
                                      <FiatValue bnb={w.capital.reserved} />
                                    </dd>
                                  </div>
                                  <div className="flex flex-wrap justify-between gap-1">
                                    <dt>Reserva para gás</dt>
                                    <dd className="break-all text-right">
                                      {bnb(w.capital.gas)}
                                      <FiatValue bnb={w.capital.gas} />
                                    </dd>
                                  </div>
                                  <div className="flex flex-wrap justify-between gap-1">
                                    <dt>BNB sem reserva dos robôs</dt>
                                    <dd className="break-all">
                                      {w.capital.free == null
                                        ? "Aguardando verificação das operações"
                                        : bnb(w.capital.free)}
                                      {w.capital.free != null && <FiatValue bnb={w.capital.free} />}
                                    </dd>
                                  </div>
                                </dl>
                              )}
                              {w.capital && Number(w.capital.shortfall ?? 0) > 0 && (
                                <p className="mt-2 text-xs text-warning">
                                  As reservas planejadas excedem o saldo: faltam{" "}
                                  {bnb(w.capital.shortfall!)}.
                                </p>
                              )}
                              {w.bot && !w.capital && (
                                <p className="mt-2 text-xs text-warning">
                                  Divisão das reservas indisponível nesta consulta.
                                </p>
                              )}
                            </details>
                            {w.issues.map((issue) => (
                              <p key={issue} className="mx-4 mb-3 text-xs text-warning">
                                {issue}
                              </p>
                            ))}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Cada endereço é contado uma vez. As reservas já estão incluídas no BNB; o custo das
              compras não é saldo adicional. Tokens populares e cadastrados são consultados;
              adicione outros tokens para incluí-los. Valores de mercado e conversões são
              estimativas, antes de taxas de venda.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Saldos consultados em {new Date(q.data.balanceAt).toLocaleString("pt-BR")}.
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
