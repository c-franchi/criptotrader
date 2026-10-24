import { ReconcileSaleButton } from "./ReconcileSaleButton";
import { FiatValue } from "@/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { getGuidedBotPerformance } from "@/lib/guidedBot.functions";
import { Panel } from "./AppShell";
export function BotPerformancePanel({
  walletScope,
  token,
  onUpdated,
}: {
  walletScope: string;
  token: string;
  onUpdated?: () => void;
}) {
  const q = useQuery({
    queryKey: ["bot-performance", walletScope, token],
    queryFn: () => getGuidedBotPerformance({ data: { walletScope, token } }),
    refetchInterval: 30000,
    retry: false,
  });
  const money = (n: number | null | undefined) =>
    n == null ? "Não apurado" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 10 })} BNB`;
  return (
    <Panel title="Resultado deste robô">
      {q.isError ? (
        <p>Resultados indisponíveis. O histórico de operações continua preservado.</p>
      ) : !q.data ? (
        <p>Nenhuma posição apurada para este robô.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Operações encerradas", q.data.realized],
              ["Posição aberta · estimativa", q.data.open],
              ["Resultado total · estimativa", q.data.total],
              ["Gás das ordens · já incluído", q.data.fees],
            ].map(([label, n]) => (
              <div key={String(label)}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-semibold tabular-nums">{money(n as number | null)}</dd>
                {n != null && <FiatValue bnb={Number(n)} />}
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            A posição aberta varia com o preço e ainda não desconta o custo futuro de venda.
            Depósitos não são lucro. Valores sem confirmação ficam como “Não apurado”.
          </p>
          {(q.data.cycles ?? []).map((cycle, index) => (
            <section
              key={cycle.id}
              className="mt-4 rounded-xl border border-border p-3"
              aria-label="Resultado da operação encerrada"
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
                <span>
                  Operação encerrada · {cycle.buys} {cycle.buys === 1 ? "compra" : "compras"}
                </span>
                <time>{new Date(cycle.closedAt).toLocaleString("pt-BR")}</time>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Total das compras", cycle.invested],
                  ["BNB recebido na venda", cycle.received],
                  ["Gás total · já descontado", cycle.gas],
                  ["Lucro ou prejuízo líquido", cycle.net],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-semibold tabular-nums">
                      {money(value == null ? null : Number(value))}
                    </dd>
                    {value != null && <FiatValue bnb={Number(value)} />}
                  </div>
                ))}
              </dl>
              {cycle.percent != null && (
                <p className="mt-2 text-sm font-semibold">
                  Resultado sobre o valor das compras: {cycle.percent}%
                </p>
              )}
              {!cycle.complete && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Operação encerrada. O resultado líquido aguarda a confirmação dos valores na rede.
                </p>
              )}
              {cycle.pendingHashes.map((hash, hashIndex) => (
                <ReconcileSaleButton
                  key={hash}
                  hash={hash}
                  auto={index === 0 && hashIndex === 0}
                  onUpdated={onUpdated}
                />
              ))}
            </section>
          ))}
          <details className="mt-2 text-xs">
            <summary>Detalhes da apuração</summary>
            {q.data.scope}
          </details>
        </>
      )}
    </Panel>
  );
}
