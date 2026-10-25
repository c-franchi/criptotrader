import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getExecutionTiming, testExecutionRpc } from "@/lib/executionTiming.functions";
import { timingDuration, type TimingSnapshot, type TimingStage } from "@/lib/executionTiming";
import { Button } from "./ui/button";
const duration = (n: number | null) =>
  n == null
    ? "Não medido"
    : n < 1000
      ? `${Math.round(n)} ms`
      : `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s`;
const labels: Record<string, string> = {
  evaluated: "Verificação concluída",
  sent: "Envio comunicado ao RPC · aguardando rede",
  broadcast_uncertain: "Resposta do envio incerta · não repetir",
  approval_sent: "Aprovação enviada antes da venda",
  approval_confirmed: "Aprovação confirmada · próxima etapa é o swap",
  confirmed: "Confirmação da rede observada",
  reverted: "Transação revertida na rede",
  pending: "Confirmação pendente · conciliação necessária",
};
function StageTimes({ sample }: { sample: TimingSnapshot }) {
  const rows: [string, TimingStage, TimingStage][] = [
    ["Consulta de mercado e configuração", "evaluationStarted", "marketReady"],
    ["Gatilho identificado → tentativa de envio", "signalDetected", "broadcastAttempted"],
    ["Preparação da última transação", "preparationStarted", "prepared"],
    ["Tentativa de envio → confirmação observada", "broadcastAttempted", "receiptObserved"],
  ];
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, start, end]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt>{label}</dt>
          <dd className="shrink-0 tabular-nums">{duration(timingDuration(sample, start, end))}</dd>
        </div>
      ))}
    </dl>
  );
}
export function ExecutionTimingPanel({
  walletScope,
  token,
}: {
  walletScope: string;
  token: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false),
    [probing, setProbing] = useState(false),
    [probe, setProbe] = useState<Awaited<ReturnType<typeof testExecutionRpc>> | null>(null),
    [probeError, setProbeError] = useState("");
  const q = useQuery({
    queryKey: ["execution-timing", user?.id, walletScope, token],
    queryFn: () => getExecutionTiming({ data: { walletScope, token } }),
    enabled: open && !!user,
    refetchInterval: 2000,
    retry: false,
  });
  const latest = q.data?.records[0];
  const trade = q.data?.records.find((r) => r.stages.signalDetected != null);
  const progress = q.data?.records.find(
    (r) => r.phase !== "evaluated" && (!trade || r.runId === trade.runId),
  );
  const receipt = progress?.hash ? q.data?.submissions.find((s) => s.hash === progress.hash) : null;
  const phase =
    receipt && receipt.status !== "pending"
      ? progress?.phase.startsWith("approval") && receipt.status === "confirmed"
        ? "approval_confirmed"
        : receipt.status
      : progress?.phase;
  const blockActive = q.data?.records.some((r) => r.trigger === "block");
  return (
    <details
      className="my-3 rounded-2xl border border-border p-4"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Tempo: verificações ~2 s · execução não é instantânea
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-sm">
          <b>Preço programado é um gatilho, não uma ordem já colocada na corretora.</b> A
          verificação tem intervalo programado de aproximadamente 2 segundos. Consultas, fila da
          carteira, aprovação do token e rede acrescentam tempo. O intervalo real pode ser maior; o
          preço final não é garantido.
        </p>
        <p className="text-xs text-muted-foreground">
          As medições começam quando o servidor verifica o robô, não no instante exato em que o
          mercado tocou o preço. Regras por médias ou recuperação aguardam as velas fechadas
          exigidas. O envio é separado da confirmação: atualmente são aguardadas 3 confirmações; o
          limite de espera da consulta é 45 segundos, não um prazo prometido. Se continuar pendente,
          não se envia outra ordem para substituir a anterior automaticamente.
        </p>
        {q.isPending && <p className="text-sm">Carregando medições…</p>}
        {q.isError && (
          <p role="alert" className="text-sm">
            Não foi possível consultar os tempos.{" "}
            <Button variant="outline" onClick={() => void q.refetch()}>
              Tentar novamente
            </Button>
          </p>
        )}
        {q.data && (
          <>
            <p className="text-sm">
              Última avaliação registrada:{" "}
              {q.data.evaluatedAt
                ? new Date(q.data.evaluatedAt).toLocaleString("pt-BR")
                : "Ainda não registrada"}
              {!q.data.armed && " · robô pausado"}.
            </p>
            <p className="text-xs text-muted-foreground">
              Disparo observado nas amostras:{" "}
              {blockActive
                ? "há registros por novo bloco e o agendamento continua disponível"
                : "agendamento periódico; nenhum disparo WebSocket registrado para este robô"}
              .
            </p>
            {!latest && (
              <p className="text-sm">
                Sem medições novas para este robô. Os dados aparecerão em verificações futuras, sem
                iniciar operações por abrir esta tela.
              </p>
            )}
            {latest && (
              <>
                <p className="text-sm">
                  Último ciclo medido: {duration(latest.elapsedMs)}. Amostras de ciclos sem ordem
                  são limitadas para reduzir gravações; não representam todos os ciclos.
                </p>
                <p className="text-xs text-muted-foreground">
                  Etapas da amostra iniciada em{" "}
                  {new Date((trade ?? latest).stages.evaluationStarted ?? 0).toLocaleString(
                    "pt-BR",
                  )}
                  .
                </p>
                {latest.previousEvaluationAt != null && latest.stages.evaluationStarted != null && (
                  <p className="text-xs text-muted-foreground">
                    Tempo desde a avaliação anterior:{" "}
                    {duration(
                      Math.max(0, latest.stages.evaluationStarted - latest.previousEvaluationAt),
                    )}
                    . Pode incluir pausas do robô.
                  </p>
                )}
                <StageTimes sample={trade ?? latest} />
              </>
            )}
            {trade && !progress && (
              <p className="text-sm">
                Gatilho identificado nessa amostra; não há envio registrado para ela. Confira os
                limites e avisos do robô.
              </p>
            )}
            {phase && (
              <p role="status" className="rounded-xl bg-secondary p-3 text-sm">
                Última operação medida: {labels[phase] ?? phase}
                {progress?.stages.broadcastAttempted && (
                  <>
                    {" "}
                    · envio tentado às{" "}
                    {new Date(progress.stages.broadcastAttempted).toLocaleTimeString("pt-BR")}
                  </>
                )}
                {progress?.hash && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      className="text-primary underline"
                      href={`https://bscscan.com/tx/${progress.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver transação ↗
                    </a>
                  </>
                )}
              </p>
            )}
          </>
        )}
        <div className="border-t pt-3">
          <Button
            variant="outline"
            disabled={probing}
            onClick={async () => {
              setProbing(true);
              setProbeError("");
              try {
                setProbe(await testExecutionRpc());
              } catch {
                setProbeError("Não foi possível testar a conexão agora.");
              } finally {
                setProbing(false);
              }
            }}
          >
            {probing ? "Medindo conexão…" : "Testar conexão com a BSC"}
          </Button>
          {probeError && (
            <p role="alert" className="text-sm">
              {probeError}
            </p>
          )}
          {probe?.tests.map((t) => (
            <p key={t.alias} className="mt-2 text-sm">
              RPC {t.alias}:{" "}
              {t.ok ? "rede e bloco válidos" : "indisponível, rede incorreta ou bloco antigo"} ·{" "}
              {duration(t.durationMs)} · {new Date(t.at).toLocaleTimeString("pt-BR")}
            </p>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">
            Teste somente de leitura, reutilizado por até 30 segundos. Mede resposta dos provedores,
            não o prazo de uma compra ou venda. A alternativa é para consultas: transações de
            resposta incerta não são reenviadas automaticamente.
          </p>
        </div>
      </div>
    </details>
  );
}
