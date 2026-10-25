import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { useAuth } from "@/hooks/useAuth";
import { useWalletFunds } from "@/hooks/useWalletFunds";
import { useNavigate } from "@tanstack/react-router";
import { WalletRobots } from "./WalletRobots";
import { WalletPicker } from "./WalletPicker";
import { useCurrency } from "@/hooks/currencyContext";
import { FiatValue } from "@/hooks/useCurrency";
import { fiatEstimate, formatFiat } from "@/lib/fiat";
import { fundsTotal, formatFundAmount, fundWalletAssets } from "@/lib/fundsOverview";
import { Panel } from "./AppShell";
import { Button } from "./ui/button";
import { TokenLogo } from "./TokenLogo";

export function FundsOverview() {
  const { user } = useAuth();
  const { tokens } = useSelectedToken();
  const { currency, quote } = useCurrency();
  const {
    q,
    wallets,
    wallet: selected,
    robotWallets,
    choices,
    value,
    chooseId,
    choose,
  } = useWalletFunds();
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const navigate = useNavigate();
  if (!user) return null;
  const total = fundsTotal(wallets);
  const local = (value: string | null) => {
    const amount = fiatEstimate(value, "BNB", currency, quote);
    return value == null
      ? "Não apurado"
      : amount == null
        ? `${formatFundAmount(value, 10)} BNB`
        : formatFiat(amount, currency);
  };
  const selectedTotal = selected ? fundsTotal([selected]) : null;
  const assets = selected ? fundWalletAssets(selected) : [];
  const expanded = !!selected && expandedFor === selected.address;
  const shown = expanded ? assets : assets.slice(0, 4);
  return (
    <div className="mb-5" data-funds-overview>
      <Panel title="Sua carteira">
        <div className="mb-5 flex items-center justify-between gap-3">
          <WalletPicker
            options={choices}
            value={value}
            onChange={(id) => {
              setExpandedFor(null);
              return chooseId(id);
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0 rounded-full"
            aria-label="Atualizar saldos"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw className={`size-5 ${q.isFetching ? "animate-spin" : ""}`} />
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
        ) : selected && selectedTotal ? (
          <>
            <div className="py-3">
              <p className="text-sm text-muted-foreground">
                {selectedTotal.complete
                  ? q.isError
                    ? "Último saldo consultado"
                    : "Valor da carteira · estimativa"
                  : "Consulta parcial · subtotal apurado"}
              </p>
              <p className="mt-1 break-words text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
                {local(selectedTotal.total ?? selectedTotal.known)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {selected.bot ? "Carteira dos robôs · saldo compartilhado" : "Carteira pessoal"}
                {selected.bot && selected.personal ? " · também cadastrada como pessoal" : ""}
              </p>
            </div>
            {!selectedTotal.complete && (
              <p role="status" className="mt-3 text-sm text-warning">
                Há saldo ou tokens sem consulta/cotação. O total completo ainda está indisponível; o
                subtotal soma apenas valores apurados.
              </p>
            )}
            <section aria-label={`Tokens de ${selected.label}`} className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Tokens</h3>
                {assets.length > 4 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={expanded}
                    aria-controls="wallet-fund-tokens"
                    onClick={() => setExpandedFor(expanded ? null : selected.address)}
                  >
                    {expanded ? "Mostrar menos" : `Ver todos (${assets.length})`}
                  </Button>
                )}
              </div>
              <ul id="wallet-fund-tokens" className="mt-1 divide-y divide-border">
                {shown.map((a) => {
                  const name =
                    tokens.find((t) => t.address.toLowerCase() === a.address.toLowerCase())?.name ??
                    a.name;
                  return (
                    <li key={a.address}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl py-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                        onClick={() => {
                          if (!choose(selected)) return;
                          void navigate({
                            to: "/operar",
                            search:
                              a.address === "native" ? { pagamento: "BNB" } : { token: a.address },
                          });
                        }}
                        aria-label={`Operar ${a.symbol} da carteira ${selected.label}`}
                      >
                        <TokenLogo address={a.address} symbol={a.symbol} logoUrl={a.logoUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold sm:text-base">{name}</p>
                          <p
                            className="mt-1 break-all text-xs tabular-nums text-muted-foreground"
                            title={a.amount == null ? undefined : `${a.amount} ${a.symbol}`}
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
                          <p className="mt-1 text-xs text-muted-foreground">
                            {a.value == null
                              ? "Cotação ou saldo indisponível"
                              : "Valor do seu saldo · estimativa"}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            <WalletRobots wallets={robotWallets} local={local} />
            <details className="mt-3 border-t border-border pt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Endereço e reservas
              </summary>
              <a
                href={`https://bscscan.com/address/${selected.address}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block break-all font-mono text-xs text-primary underline"
              >
                {selected.address}
              </a>
              {selected.capital && (
                <dl className="mt-3 space-y-3 text-xs">
                  {[
                    ["Reserva planejada para compras", selected.capital.reserved],
                    ["Reserva para gás", selected.capital.gas],
                    ["BNB sem reserva dos robôs", selected.capital.free],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-wrap justify-between gap-1">
                      <dt>{label}</dt>
                      <dd className="break-all text-right">
                        {value == null
                          ? "Aguardando verificação das operações"
                          : `${formatFundAmount(value)} BNB`}
                        {value != null && <FiatValue bnb={value} />}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {selected.capital && Number(selected.capital.shortfall ?? 0) > 0 && (
                <p className="mt-2 text-xs text-warning">
                  As reservas planejadas excedem o saldo: faltam{" "}
                  {formatFundAmount(selected.capital.shortfall!)} BNB.
                </p>
              )}
              {selected.bot && !selected.capital && (
                <p className="mt-2 text-xs text-warning">
                  Divisão das reservas indisponível nesta consulta.
                </p>
              )}
            </details>
            {selected.issues.map((issue) => (
              <p key={issue} className="mt-2 text-xs text-warning">
                {issue}
              </p>
            ))}
            <details className="mt-4 rounded-xl bg-muted/40 p-3">
              <summary className="cursor-pointer text-sm">
                Total de fundos · todas as carteiras{" "}
                <strong className="ml-1 tabular-nums">{local(total.total ?? total.known)}</strong>
                {!total.complete ? " · parcial" : ""}
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Carteiras pessoais + carteiras dos robôs. Cada endereço é contado uma vez. Reservas
                já estão incluídas no BNB; o custo das compras não é saldo adicional.
              </p>
            </details>
            <p className="mt-4 text-xs text-muted-foreground">
              Tokens populares e cadastrados são consultados; adicione outros para incluí-los.
              Valores de mercado são estimativas, antes de taxas de venda.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Saldos consultados em {new Date(q.data.balanceAt).toLocaleString("pt-BR")}.
            </p>
          </>
        ) : (
          <div>
            <WalletRobots wallets={robotWallets} local={local} />
            <p className="text-sm text-muted-foreground">
              Nenhuma carteira pessoal selecionada.{" "}
              <a className="text-primary underline" href="/carteiras#adicionar-carteira">
                Adicionar carteira
              </a>
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
