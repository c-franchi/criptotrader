import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getMarket } from "@/lib/chain.functions";
import { getTransfers } from "@/lib/transfers.functions";
import { userMessage } from "@/lib/userMessage";
import { Button } from "./ui/button";

export function TokenActivity(props: {
  token: string;
  symbol: string;
  decimals: number;
  pool?: string;
}) {
  // Reset both disclosure and queries when changing tokens. Never show a previous
  // asset's transfers or ranking under the newly selected symbol.
  return <Activity key={`${props.token.toLowerCase()}:${props.pool ?? ""}`} {...props} />;
}

function Activity({
  token,
  symbol,
  decimals,
  pool,
}: {
  token: string;
  symbol: string;
  decimals: number;
  pool?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"trades" | "ranking">("trades");
  const market = useQuery({
    queryKey: ["market", token],
    queryFn: () => getMarket({ data: { address: token } }),
    enabled: open && !pool,
    staleTime: 30000,
    retry: false,
  });
  const pair =
    pool ??
    market.data?.pools.find((p) => p.supported)?.pairAddress ??
    market.data?.pools[0]?.pairAddress;
  const q = useQuery({
    queryKey: ["token-activity", token.toLowerCase(), pair?.toLowerCase()],
    queryFn: () => getTransfers({ data: { address: token, ...(pair ? { pool: pair } : {}) } }),
    enabled: open && !!pair,
    staleTime: 45000,
    refetchInterval: open ? 60000 : false,
    retry: false,
  });
  const quantity = (raw: string) => {
    try {
      return Number(formatUnits(BigInt(raw), decimals)).toLocaleString("pt-BR", {
        maximumSignificantDigits: 8,
      });
    } catch {
      return "Não apurada";
    }
  };
  const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
  const classification = (from: string, to: string) =>
    !pair
      ? "Transferência"
      : from.toLowerCase() === pair.toLowerCase()
        ? "Compra provável"
        : to.toLowerCase() === pair.toLowerCase()
          ? "Venda provável"
          : "Transferência";
  return (
    <details
      className="mt-4 border-t border-border py-3"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Compras, vendas e traders · {symbol}
      </summary>
      {open && (
        <div className="mt-4 min-w-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Movimentações públicas do token. Compras e vendas são classificações aproximadas das
            transferências de entrada e saída do par consultado. Podem incluir roteadores, liquidez
            e taxas; não representam seu histórico pessoal nem comprovam lucro.
          </p>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Atividade do token">
            <Button
              id={`activity-trades-${token}`}
              role="tab"
              aria-selected={tab === "trades"}
              aria-controls={`activity-content-${token}`}
              size="sm"
              variant={tab === "trades" ? "default" : "outline"}
              onClick={() => setTab("trades")}
            >
              Compras e vendas
            </Button>
            <Button
              id={`activity-ranking-${token}`}
              role="tab"
              aria-selected={tab === "ranking"}
              aria-controls={`activity-content-${token}`}
              size="sm"
              variant={tab === "ranking" ? "default" : "outline"}
              onClick={() => setTab("ranking")}
            >
              Ranking de traders
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={market.isFetching || q.isFetching}
              onClick={() => {
                if (pair) void q.refetch();
                else void market.refetch();
              }}
            >
              Atualizar movimentações
            </Button>
          </div>
          {!pair &&
            (market.isPending ? (
              <p role="status" className="text-sm">
                Localizando o par deste token…
              </p>
            ) : (
              <p role="status" className="text-sm">
                Não foi possível localizar um par para classificar as movimentações. Atualize a
                consulta.
              </p>
            ))}
          {pair && q.isPending && (
            <p role="status" className="text-sm">
              Consultando movimentações da rede…
            </p>
          )}
          {(q.isError || q.data?.error) && (
            <p role="status" className="text-sm text-warning">
              {q.isError
                ? userMessage(
                    q.error,
                    "Não foi possível consultar as movimentações agora. Tente atualizar mais tarde.",
                  )
                : userMessage(q.data?.error)}
            </p>
          )}
          {q.data && (
            <>
              <p className="text-xs text-muted-foreground">
                Amostra de {q.data.rankedTransfers.toLocaleString("pt-BR")} transferências em{" "}
                {q.data.scannedBlocks.toLocaleString("pt-BR")} blocos consultados · consulta de{" "}
                {new Date(q.data.fetchedAt).toLocaleString("pt-BR")}.
              </p>
              <div
                role="tabpanel"
                id={`activity-content-${token}`}
                aria-labelledby={`activity-${tab === "trades" ? "trades" : "ranking"}-${token}`}
                className="max-h-96 overflow-auto"
              >
                {tab === "trades" ? (
                  <>
                    {!q.data.transfers.length && !q.data.error && (
                      <p className="text-sm">
                        Nenhuma transferência encontrada na faixa consultada. Isso não significa
                        ausência de negociações em outros períodos.
                      </p>
                    )}
                    <ul className="divide-y divide-border">
                      {q.data.transfers.map((t, i) => (
                        <li key={`${t.hash}:${i}`} className="space-y-1 py-3 text-sm">
                          <div className="flex flex-wrap justify-between gap-2">
                            <b>{classification(t.from, t.to)}</b>
                            <span className="tabular-nums">
                              {quantity(t.amountRaw)} {symbol}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            De{" "}
                            <a
                              href={`https://bscscan.com/address/${t.from}`}
                              title={t.from}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline"
                            >
                              {short(t.from)}
                            </a>{" "}
                            para{" "}
                            <a
                              href={`https://bscscan.com/address/${t.to}`}
                              title={t.to}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline"
                            >
                              {short(t.to)}
                            </a>{" "}
                            · bloco {t.block.toLocaleString("pt-BR")}
                          </p>
                          <a
                            href={`https://bscscan.com/tx/${t.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary underline"
                          >
                            Ver transação ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Endereços ordenados pelo volume de tokens movimentados com este par na
                      amostra. Roteadores podem aparecer; não é um ranking de rentabilidade.
                    </p>
                    {!q.data.ranking.length && (
                      <p className="text-sm">
                        Nenhum endereço classificado com este par na amostra disponível.
                      </p>
                    )}
                    <ol className="divide-y divide-border">
                      {q.data.ranking.map((r, i) => (
                        <li key={r.wallet} className="py-3 text-sm">
                          <div className="flex flex-wrap justify-between gap-2">
                            <a
                              href={`https://bscscan.com/address/${r.wallet}`}
                              title={r.wallet}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline"
                            >
                              {i + 1}. {short(r.wallet)}
                            </a>
                            <b className="tabular-nums">
                              {quantity(r.volumeRaw)} {symbol}
                            </b>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Compras prováveis: {r.buys} · Vendas prováveis: {r.sells} ·
                            Movimentações: {r.trades}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </details>
  );
}
