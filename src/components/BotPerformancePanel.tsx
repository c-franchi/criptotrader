import { FiatValue } from "@/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { getGuidedBotPerformance } from "@/lib/guidedBot.functions";
import { Panel } from "./AppShell";
export function BotPerformancePanel({
  walletScope,
  token,
}: {
  walletScope: string;
  token: string;
}) {
  const q = useQuery({
    queryKey: ["bot-performance", walletScope, token],
    queryFn: () => getGuidedBotPerformance({ data: { walletScope, token } }),
    refetchInterval: 30000,
    retry: false,
  });
  const money = (n: number | null | undefined) =>
    n == null ? "Não apurado" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} BNB`;
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
          <details className="mt-2 text-xs">
            <summary>Detalhes da apuração</summary>
            {q.data.scope}
          </details>
        </>
      )}
    </Panel>
  );
}
