import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getExecutionStatus } from "@/lib/bot.functions";
import { Button } from "@/components/ui/button";

/** Observes the same wallet and token guards used by the database; never arms a bot. */
export function StrategyApplicationStatus({
  walletScope,
  token,
}: {
  walletScope: string;
  token: string;
}) {
  const status = useQuery({
    queryKey: ["strategy-application-status", walletScope, token],
    queryFn: async () => {
      const [execution, { data, error }] = await Promise.all([
        getExecutionStatus({ data: { walletScope } }),
        supabase
          .from("grid_bots")
          .select("strat_state")
          .eq("wallet_scope", walletScope)
          .ilike("token", token),
      ]);
      if (error) throw new Error("Não foi possível consultar a posição do robô.");
      const openPosition = (data ?? []).some((bot) => {
        const state = bot.strat_state as { tokens?: string | number } | null;
        return Number(state?.tokens ?? 0) > 0;
      });
      return { ...execution, openPosition };
    },
    refetchInterval: 15_000,
  });
  const state = status.data;
  return (
    <div className="mt-3 space-y-2 rounded-md border border-border p-3 text-sm" aria-live="polite">
      <p className="font-semibold">Aplicação no robô real</p>
      {status.isError ? (
        <p>Não foi possível verificar os bloqueios agora. Confira novamente antes de aplicar.</p>
      ) : !state ? (
        <p>Consultando operações e posição desta carteira…</p>
      ) : state.locked ? (
        <>
          <p className="text-warning">
            A carteira está com execução pendente de conciliação. Isso impede aplicar a estratégia,
            mesmo com o robô desligado.
          </p>
          {state.lockAcquiredAt && (
            <p>Bloqueio registrado em {new Date(state.lockAcquiredAt).toLocaleString("pt-BR")}.</p>
          )}
          {state.pending.length === 0 && (
            <p>
              Não há transação no diário atual. O bloqueio precisa ser investigado no painel do
              robô; ele não é removido automaticamente.
            </p>
          )}
          {state.pending.map((item) => (
            <a
              key={item.tx_hash}
              className="block break-all text-primary underline"
              href={`https://bscscan.com/tx/${item.tx_hash}`}
              target="_blank"
              rel="noreferrer"
            >
              Conferir transação {item.tx_hash}
            </a>
          ))}
        </>
      ) : state.openPosition ? (
        <p className="text-warning">
          Este token tem uma posição aberta. Os ajustes ficam em rascunho até o ciclo terminar;
          pausar o robô não encerra essa posição.
        </p>
      ) : (
        <p>
          Nenhuma execução pendente ou posição aberta detectada. Revise a versão real e clique em
          Aplicar rascunho. A confirmação do salvamento valida novamente essas condições.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
        >
          Verificar novamente
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/grade">Ver operações do robô</Link>
        </Button>
      </div>
    </div>
  );
}
