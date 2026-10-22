import { useQuery } from "@tanstack/react-query";
import { getWalletCapital } from "@/lib/capital.functions";
import { Panel } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

const bnb = (value: string) =>
  `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 10 })} BNB`;
export function WalletCapitalPanel({
  walletScope,
  previewId,
  locked,
  tokens,
}: {
  walletScope: string;
  previewId?: string | undefined;
  locked: boolean | undefined;
  tokens: { address: string; symbol: string }[];
}) {
  const report = useQuery({
    queryKey: ["wallet-capital", walletScope, previewId],
    queryFn: () => getWalletCapital({ data: { walletScope, ...(previewId ? { previewId } : {}) } }),
    refetchInterval: 15_000,
    retry: 1,
  });
  const c = report.data;
  return (
    <Panel
      title="Saldo e divisão do capital da carteira"
      right={
        <Button
          size="sm"
          variant="outline"
          disabled={report.isFetching}
          onClick={() => void report.refetch()}
        >
          Atualizar saldo
        </Button>
      }
    >
      {report.isError ? (
        <p className="text-warning">
          Não foi possível consultar o saldo na rede e as reservas. Os valores estão indisponíveis;
          tente atualizar.
        </p>
      ) : !c ? (
        <p className="text-muted-foreground">
          {report.isPending
            ? "Consultando saldo na rede…"
            : "Crie a carteira do robô para acompanhar o capital."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              ["BNB na carteira", c.balance],
              ["Em posições registradas", c.invested],
              ["Reservado para compras", c.reserved],
              ["Reserva para gás", c.gas],
              ["Livre para outro trade", locked !== false ? "0" : c.free],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 break-words text-lg font-semibold">{bnb(value!)}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            O valor em posições é o custo registrado dos tokens, não uma cotação de venda. Posições
            de grade sem custo registrado devem ser conferidas no histórico. Ele já saiu do BNB da
            carteira e não é descontado duas vezes. Reservas são compromissos internos para novas
            compras, não transferências na rede.
          </p>
          {previewId && (
            <p className="mt-2 text-xs text-primary">
              Prévia de início: inclui o capital do bot selecionado, mesmo pausado. Os outros bots
              pausados não reservam verba para novas compras.
            </p>
          )}
          {locked !== false && (
            <p className="mt-2 rounded border border-warning/40 p-2 text-sm text-warning">
              {locked
                ? "Conciliação pendente: nenhum saldo está liberado para novas operações até verificar a execução anterior. Resetar estratégias não libera esta trava."
                : "Conferindo execução da carteira: saldo livre ainda não confirmado."}
            </p>
          )}
          {Number(c.shortfall) > 0 && (
            <p className="mt-2 text-sm text-warning">
              Faltam {bnb(c.shortfall)} para atender todas as reservas exibidas. Reduza o capital
              dos bots, pause um deles ou adicione saldo. O executor confere o saldo novamente antes
              de cada compra.
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="mb-2 text-left font-semibold">
                Bots que usam esta mesma carteira
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2">Bot</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Em posição</th>
                  <th className="p-2">Reserva de compra</th>
                  <th className="p-2">Gás</th>
                  <th className="p-2">Disponível para o bot</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row) => (
                  <tr className="border-b border-border" key={row.id}>
                    <td className="p-2">
                      {tokens.find((t) => t.address.toLowerCase() === row.token.toLowerCase())
                        ?.symbol ?? `${row.token.slice(0, 8)}…`}
                    </td>
                    <td className="p-2">
                      {!row.configured
                        ? "Configurar estratégia"
                        : row.armed
                          ? "Ligado"
                          : row.id === previewId
                            ? "Prévia de início"
                            : "Pausado"}
                    </td>
                    <td className="p-2">
                      {row.mode === "grade"
                        ? "Ver tokens e histórico da grade"
                        : `${bnb(row.invested)}${row.estimated ? " (estimado)" : " (custo registrado)"}`}
                    </td>
                    <td className="p-2">{bnb(row.reserved)}</td>
                    <td className="p-2">{bnb(row.gas)}</td>
                    <td className="p-2">
                      {locked !== false
                        ? "Bloqueado"
                        : row.armed || row.id === previewId
                          ? bnb(row.available)
                          : "Sem reserva"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sem limite de capital individual: reserva as compras fixas restantes da estratégia, o
            percentual da próxima entrada ou uma ordem de grade. Para dividir um valor fixo entre
            bots, defina “Capital máximo deste robô” na estratégia. Carteiras diferentes têm saldos
            independentes. Atualizado em {new Date(c.at).toLocaleTimeString("pt-BR")}.
          </p>
        </>
      )}
    </Panel>
  );
}
