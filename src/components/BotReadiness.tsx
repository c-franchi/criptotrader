import { useQuery } from "@tanstack/react-query";
import { getBotReadiness } from "@/lib/guidedBot.functions";
import { Panel } from "./AppShell";
import { Button } from "./ui/button";
export function BotReadiness({
  walletScope,
  token,
  onConfigure,
}: {
  walletScope: string;
  token: string;
  onConfigure: () => void;
}) {
  const q = useQuery({
    queryKey: ["bot-readiness", walletScope, token],
    queryFn: () => getBotReadiness({ data: { walletScope, token } }),
    refetchInterval: 30000,
    retry: false,
  });
  return (
    <Panel title="Verificações antes de iniciar">
      {q.isError ? (
        <p role="alert">
          Não foi possível conferir o robô. Tente verificar novamente; o início será validado no
          servidor.
        </p>
      ) : !q.data ? (
        <p>Conferindo moeda, mercado, saldo e taxas…</p>
      ) : (
        <>
          <p className={q.data.ready ? "text-success" : "text-warning"}>
            {q.data.ready
              ? "Pronto para iniciar. Nenhuma operação foi enviada."
              : "Ainda não está pronto para iniciar."}
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {q.data.errors.map((e) => (
              <li key={e} role="alert">
                • {e}
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt>Disponível para este robô</dt>
              <dd>{q.data.available == null ? "Não apurado" : `${q.data.available} BNB`}</dd>
            </div>
            <div>
              <dt>Taxa estimada da compra</dt>
              <dd>{q.data.feeBnb == null ? "Não apurada" : `${q.data.feeBnb.toFixed(8)} BNB`}</dd>
            </div>
            <div>
              <dt>Custo estimado de troca, ida e volta</dt>
              <dd>
                {q.data.exchangeCostBnb == null
                  ? "Não apurado"
                  : `${q.data.exchangeCostBnb.toFixed(8)} BNB`}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            A taxa da rede da venda ainda não foi apurada. O custo de troca de ida e volta não
            inclui esse gás.
          </p>
          <details className="mt-3 text-xs text-muted-foreground">
            <summary>Sobre estas estimativas</summary>
            {q.data.warnings.map((w) => (
              <p className="mt-2" key={w}>
                {w}
              </p>
            ))}
            <p>
              O custo de troca considera cotações e taxas da moeda. A taxa da rede da venda não está
              incluída.
            </p>
          </details>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          Verificar novamente
        </Button>
        <Button size="sm" variant="outline" onClick={onConfigure}>
          Configurar aqui
        </Button>
      </div>
    </Panel>
  );
}
