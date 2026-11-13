import { walletSessionIssue, type WalletSession } from "@/lib/walletSession";
import { Button } from "./ui/button";

export function WalletConnectionNotice({
  session,
  expected,
  checking,
  error,
  disabled,
  onReconnect,
}: {
  session: WalletSession;
  expected?: string | null | undefined;
  checking: boolean;
  error: string;
  disabled: boolean;
  onReconnect: () => void;
}) {
  const issue = error || (session.account ? walletSessionIssue(session, expected) : null);
  const address = (value?: string | null) =>
    value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Não conectada";
  return (
    <div className="mt-2 min-w-0 space-y-2 text-sm">
      <p>
        Carteira conectada: <strong>{address(session.account)}</strong>
      </p>
      {expected && (
        <p>
          Carteira necessária (origem): <strong>{address(expected)}</strong>
        </p>
      )}
      <p>
        Rede:{" "}
        {session.chain === 56
          ? "BNB Smart Chain (56)"
          : session.chain == null
            ? "Não confirmada"
            : `Outra rede (${session.chain})`}
      </p>
      <details className="rounded-lg border p-2">
        <summary className="cursor-pointer">Ver endereços completos</summary>
        <p className="mt-2 break-all">Conectada: {session.account ?? "Não conectada"}</p>
        {expected && <p className="mt-1 break-all">Origem necessária: {expected}</p>}
      </details>
      {checking ? (
        <p role="status">Conferindo conta e rede…</p>
      ) : (
        issue && (
          <p role="alert" className="text-destructive">
            {issue}
          </p>
        )
      )}
      {(issue || session.account) && (
        <Button type="button" variant="outline" disabled={disabled} onClick={onReconnect}>
          Reconectar carteira
        </Button>
      )}
    </div>
  );
}
