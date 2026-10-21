import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { auditOrder } from "@/lib/audit.functions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/AppShell";

const cycle = [
  "0x05961252f4227be9851aadb67e6cc5f71f51ac52dd2fce95a557a6b33cfadb38",
  "0x77d6d4b79eb657ff0a06039f8c47a6ce1581421af979ffdc8d952c00bddb619e",
  "0x3f6e27ebe3f655cd5321546ce2ecb7ccd1dbede9ccc1a1f2342b862bc698b2d4",
];
export function OrderAudit({
  hashes,
  onAudited,
}: {
  hashes: string[];
  onAudited?: (rows: Awaited<ReturnType<typeof auditOrder>>[]) => void;
}) {
  const inspect = useServerFn(auditOrder);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof auditOrder>>[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (list: string[]) => {
    setBusy(true);
    setError("");
    try {
      const results = [];
      for (const hash of list) results.push(await inspect({ data: { hash } }));
      setRows(results);
      onAudited?.(results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel collapsible title="Auditoria das transações">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || !hashes.length}
          onClick={() => load(hashes.slice(0, 10))}
        >
          Consultar últimas transações
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => load(cycle)}>
          Auditar ciclo informado
        </Button>
      </div>
      {busy && <p className="mt-2 text-xs">Consultando comprovantes na BSC…</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {rows.map((r) => (
        <details key={r.hash} className="mt-3 border-t border-border pt-3 text-xs">
          <summary className="cursor-pointer font-semibold">
            {r.side} · {new Date(r.timestamp).toLocaleString("pt-BR")} · {r.status}
          </summary>
          <div className="mt-2 space-y-1 break-words">
            <p className="break-all">
              Token: {r.symbol} · {r.token}
            </p>
            <p className="break-all">Carteira: {r.wallet}</p>
            <p>Quantidade efetiva (eventos da carteira): {r.tokenDelta}</p>
            <p>BNB enviado na transação: {r.bnbSpent ?? "indisponível"}</p>
            <p>Gás confirmado: {r.gasBnb} BNB</p>
            <p className="text-warning">
              BNB recebido: {r.nativeReceivedStatus}. Saídas intermediárias do router não são o
              resultado da carteira.
            </p>
            <p>
              Cotação estimada anterior (unidades mínimas): {r.quotedOutRaw}; não é recebimento
              confirmado.
            </p>
            <p>
              Aprovação registrada:{" "}
              {r.approvalHash ??
                "Não registrada no histórico antigo; eventos exibidos abaixo não garantem localizar uma aprovação anterior."}
            </p>
            <p className="text-warning">
              {r.reconstructed
                ? "Reconstruído posteriormente: não há sinal, preço do gatilho ou parâmetros contemporâneos registrados para este hash."
                : "Parâmetros registrados no instante da decisão:"}
            </p>
            {r.snapshot && (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify(r.snapshot, null, 2)}
              </pre>
            )}
            <details>
              <summary>Eventos, pools e movimentações</summary>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify(r.events, null, 2)}
              </pre>
            </details>
            <a
              className="block break-all text-primary underline"
              href={`https://bscscan.com/tx/${r.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {r.hash}
            </a>
          </div>
        </details>
      ))}
    </Panel>
  );
}
