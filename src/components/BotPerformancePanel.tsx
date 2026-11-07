import Decimal from "decimal.js";
import { ReconcileSaleButton } from "./ReconcileSaleButton";
import { FiatValue } from "@/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { getGuidedBotPerformance } from "@/lib/guidedBot.functions";
import { Panel } from "./AppShell";

const formatBnb = (value: string | number | null | undefined) => {
  if (value == null) return "Aguardando apuração";
  const decimal = new Decimal(value);
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 12 }).format(decimal.toNumber())} BNB`;
};
const decimalSign = (value: string) => new Decimal(value).cmp(0);

export function BotPerformancePanel({
  walletScope,
  token,
  onUpdated,
  autoReconcile = true,
}: {
  walletScope: string;
  token: string;
  onUpdated?: () => void;
  autoReconcile?: boolean;
}) {
  const q = useQuery({
    queryKey: ["bot-performance", walletScope, token],
    queryFn: () => getGuidedBotPerformance({ data: { walletScope, token } }),
    refetchInterval: 30000,
    retry: false,
  });
  const recent = q.data?.cycles?.[0];
  const proofSources = (recent?.saleHashes ?? [])
    .map((hash) => q.data?.verifiedSourceByHash?.[hash])
    .filter((source): source is string => !!source);
  const receiptVerified = proofSources.includes("pancake_v2_wbnb_receipt");
  const resultSign = recent?.net == null ? null : decimalSign(recent.net);
  const headline = !recent
    ? "Nenhum ciclo encerrado"
    : recent.net == null
      ? "Resultado pendente de apuração"
      : resultSign! > 0
        ? "Lucro líquido confirmado"
        : resultSign! < 0
          ? "Prejuízo líquido confirmado"
          : "Resultado líquido: zero";
  const headlineTone =
    resultSign == null
      ? "text-warning"
      : resultSign > 0
        ? "text-success"
        : resultSign < 0
          ? "text-destructive"
          : "text-foreground";

  return (
    <Panel title="Lucro e prejuízo · este robô">
      {q.isError ? (
        <p role="alert" className="text-sm">
          Não foi possível consultar a contabilidade agora. As operações continuam registradas.
        </p>
      ) : !q.data ? (
        <p className="text-sm text-muted-foreground">
          Não foi encontrado um robô com histórico atribuído a esta carteira e ativo.
        </p>
      ) : (
        <div className="space-y-4">
          <section
            aria-label="Resultado financeiro da última operação encerrada"
            className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Último ciclo de compra e venda</p>
                <p className={`mt-1 text-base font-bold ${headlineTone}`}>{headline}</p>
              </div>
              {recent && (
                <time className="text-xs text-muted-foreground">
                  {new Date(recent.closedAt).toLocaleString("pt-BR")}
                </time>
              )}
            </div>
            {recent ? (
              <>
                {recent.net != null ? (
                  <div aria-live="polite">
                    <p
                      className={`break-words text-xl font-bold tabular-nums [overflow-wrap:anywhere] ${headlineTone}`}
                      title={recent.net}
                    >
                      {resultSign! > 0 ? "+" : ""}
                      {formatBnb(recent.net)}
                    </p>
                    {recent.percent != null && (
                      <p className="font-semibold text-sm">
                        {resultSign! > 0 ? "+" : ""}
                        {recent.percent}% sobre o valor investido
                      </p>
                    )}
                    <FiatValue bnb={recent.net} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {receiptVerified
                        ? "Evidência parcial por eventos WBNB: o recebimento nativo exige nova auditoria."
                        : proofSources.length
                          ? "Comprovado por rastreamento da transação BSC."
                          : "Resultado registrado em operações confirmadas; consulte a auditoria para a origem da evidência."}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Conversão monetária aproximada pela cotação disponível agora, não pela taxa da
                      data da venda.
                    </p>
                  </div>
                ) : (
                  <p
                    role="status"
                    className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm"
                  >
                    A venda foi confirmada na blockchain, mas o BNB efetivamente recebido ainda não
                    foi apurado. O sistema não usa previsão de preço como lucro. Abaixo está o valor
                    mínimo necessário para empatar.
                  </p>
                )}
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {[
                    ["Valor aplicado nas compras", recent.invested],
                    ["Gás total (compra, venda e eventuais falhas)", recent.gas],
                    ["BNB recebido nas vendas", recent.received],
                    ["Recebimento mínimo para não ter perda", recent.breakEven],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="min-w-0 rounded-lg border border-border/60 bg-background/30 p-2"
                    >
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd
                        className="mt-1 break-words font-semibold tabular-nums [overflow-wrap:anywhere]"
                        title={value ?? undefined}
                      >
                        {formatBnb(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {recent.net == null && (
                  <p className="text-xs text-muted-foreground">
                    Resultado real = BNB recebido − BNB das compras − gás registrado. A apuração
                    exige rastrear as transferências nativas da transação; sem essa evidência, o
                    resultado continua pendente.
                  </p>
                )}
                {recent.net == null && !q.data.accountingTraceConfigured && (
                  <p role="status" className="text-xs text-warning">
                    O servidor pode precisar de um RPC de auditoria com rastreamento histórico
                    (BSC_TRACE_RPC_URL). Sem confirmação do recebimento, nenhuma previsão será
                    apresentada como lucro.
                  </p>
                )}
                {recent.pendingHashes.map((hash, index) => (
                  <ReconcileSaleButton
                    key={hash}
                    hash={hash}
                    auto={autoReconcile && index === 0}
                    onUpdated={onUpdated}
                  />
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma compra e venda encerrada foi associada a este robô. Um saldo depositado na
                carteira não equivale a lucro.
              </p>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Resultado já realizado · total", q.data.realized],
              ["Posição aberta · estimativa", q.data.open],
              ["Resultado geral · estimativa", q.data.total],
              ["Gás já incluído nos resultados", q.data.fees],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 break-words font-semibold tabular-nums [overflow-wrap:anywhere]">
                  {formatBnb(value as number | null)}
                </p>
                {value != null && <FiatValue bnb={Number(value)} />}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Operações pendentes não entram no lucro realizado. Posição aberta é apenas uma
            estimativa e ainda não inclui uma futura taxa de venda.
          </p>
          {(q.data.cycles ?? []).slice(1).map((cycle) => (
            <details key={cycle.id} className="rounded-lg border border-border p-3 text-xs">
              <summary className="cursor-pointer font-semibold">
                Ciclo anterior · {new Date(cycle.closedAt).toLocaleString("pt-BR")} ·{" "}
                {cycle.net == null ? "pendente" : formatBnb(cycle.net)}
              </summary>
              <p className="mt-2">Compras: {formatBnb(cycle.invested)}</p>
              <p>Recebido: {formatBnb(cycle.received)}</p>
              <p>Gás: {formatBnb(cycle.gas)}</p>
              <p>Lucro ou prejuízo: {formatBnb(cycle.net)}</p>
              {cycle.pendingHashes.map((hash) => (
                <ReconcileSaleButton key={hash} hash={hash} onUpdated={onUpdated} />
              ))}
            </details>
          ))}
          <details className="text-xs text-muted-foreground">
            <summary>Origem e limites da contabilidade</summary>
            <p className="mt-2">{q.data.scope}</p>
          </details>
        </div>
      )}
    </Panel>
  );
}
