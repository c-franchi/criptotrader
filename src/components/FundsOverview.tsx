import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
                Carteiras cadastradas + robôs · BSC. Abra cada carteira para conferir BNB, tokens e
                reservas.
              </p>
            </div>
            {!total.complete && (
              <p role="status" className="mt-3 text-sm text-warning">
                Há saldo ou tokens sem consulta/cotação. O total completo ainda está indisponível; o
                subtotal soma apenas valores apurados.
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Carteiras sem robôs", fundsTotal(wallets.filter((w) => !w.bot)).total],
                ["Carteiras dos robôs", fundsTotal(wallets.filter((w) => w.bot)).total],
                ["BNB na rede", total.native],
                ["Tokens · valor apurado", total.tokens],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words text-base font-semibold tabular-nums">
                    {local(value ?? null)}
                  </dd>
                  <dd className="mt-1 break-all text-xs text-muted-foreground">
                    {bnb(value ?? null, label !== "BNB na rede")}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-3">
              {wallets.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma carteira neste grupo. Cadastre uma carteira ou crie a carteira dos robôs.
                </p>
              )}
              {wallets.map((w) => {
                const subtotal = fundsTotal([w]);
                return (
                  <details key={w.address} className="rounded-xl border border-border p-3">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        <strong>{w.label}</strong>
                        <span className="block text-xs text-muted-foreground">
                          {w.bot
                            ? w.personal
                              ? "Carteira pessoal e robôs"
                              : "Robôs · saldo compartilhado"
                            : "Carteira pessoal"}
                        </span>
                      </span>
                      <span className="text-right font-semibold">
                        {local(subtotal.total ?? subtotal.known)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {subtotal.complete ? "Ver saldos ▾" : "Consulta parcial ▾"}
                        </span>
                      </span>
                    </summary>
                    <a
                      href={`https://bscscan.com/address/${w.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 block break-all font-mono text-xs text-primary underline"
                    >
                      {w.address}
                    </a>
                    <div className="mt-3 text-sm">
                      <span className="text-muted-foreground">Saldo BNB: </span>
                      <strong className="break-all">{bnb(w.bnb)}</strong>
                      <FiatValue bnb={w.bnb} />
                    </div>
                    {w.assets.map((a) => (
                      <div key={a.address} className="mt-2 text-sm">
                        <strong className="break-all">
                          {a.amount == null ? "Saldo indisponível" : formatFundAmount(a.amount, 10)}{" "}
                          {a.symbol}
                        </strong>
                        {fundAssetValue(a) != null && <FiatValue bnb={fundAssetValue(a)} />}
                        <span className="block text-xs text-muted-foreground">
                          {a.amount != null && a.priceBnb != null
                            ? "Incluído no valor de mercado dos tokens"
                            : "Não incluído no valor total: saldo ou cotação indisponível"}
                        </span>
                      </div>
                    ))}
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
                        As reservas planejadas excedem o saldo: faltam {bnb(w.capital.shortfall!)}.
                      </p>
                    )}
                    {w.bot && !w.capital && (
                      <p className="mt-2 text-xs text-warning">
                        Divisão das reservas indisponível nesta consulta.
                      </p>
                    )}
                    {w.issues.map((issue) => (
                      <p key={issue} className="mt-2 text-xs text-warning">
                        {issue}
                      </p>
                    ))}
                  </details>
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
