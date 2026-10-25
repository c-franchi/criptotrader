import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSavedWallets } from "@/hooks/useSavedWallets";
import { LEGACY_WALLET_SCOPE } from "@/lib/walletScope";
import { getBotWallet, getBotWithdrawals, withdrawBot } from "@/lib/bot.functions";
import { botWithdrawalSchema } from "@/lib/botWithdrawal";
import { formatFundAmount } from "@/lib/fundsOverview";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
const positive = (s: string) => /^\d+(\.\d+)?$/.test(s) && /[1-9]/.test(s);
export function BotWithdrawalHistory({
  walletScope,
  enabled = true,
}: {
  walletScope: string;
  enabled?: boolean;
}) {
  const { user } = useAuth();
  const [limit, setLimit] = useState(30);
  const q = useQuery({
    queryKey: ["bot-withdrawals", user?.id, walletScope, limit],
    queryFn: () => getBotWithdrawals({ data: { walletScope, limit } }),
    enabled: enabled && !!user,
    refetchInterval: 15000,
    retry: false,
  });
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Histórico de devoluções</h3>
      <p className="text-xs text-muted-foreground">
        Transferências da carteira automática deste grupo, mesmo sem robô associado a um token.
        Devoluções não são vendas nem lucro.
      </p>
      {q.isPending && <p className="text-sm">Carregando registros…</p>}
      {q.isError && (
        <p role="alert" className="text-sm">
          Não foi possível consultar os registros.{" "}
          <Button variant="outline" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {q.data && !q.data.rows.length && !q.data.failures.length && (
        <p className="text-sm">Nenhuma devolução registrada neste grupo.</p>
      )}
      {q.data?.rows.map((r) => (
        <article key={r.id} className="space-y-2 rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <b>
              {r.symbol} · {r.status}
            </b>
            <span className="text-xs text-muted-foreground">
              {new Date(r.createdAt).toLocaleString("pt-BR")}
            </span>
          </div>
          <p>
            Quantidade enviada: {r.amount ?? "Não apurada"} {r.symbol}
          </p>
          <p>
            Recebido no destino: {r.received ?? "Não apurado no registro"}
            {r.received != null ? ` ${r.symbol}` : ""}
          </p>
          <p>Gás: {r.gasBnb != null ? `${r.gasBnb} BNB` : "Não apurado no registro"}</p>
          {r.from && <p className="break-all text-xs">Origem automática: {r.from}</p>}
          {r.to && <p className="break-all text-xs">Destino: {r.to}</p>}
          {r.token && (
            <p className="break-all text-xs text-muted-foreground">Contrato: {r.token}</p>
          )}
          <a
            href={`https://bscscan.com/tx/${r.hash}`}
            target="_blank"
            rel="noreferrer"
            className="break-all text-primary underline"
          >
            Ver transação na BscScan ↗
          </a>
          {r.status === "pendente" && (
            <p>Não repita o envio enquanto aguarda confirmação ou conciliação.</p>
          )}
        </article>
      ))}
      {q.data?.failures.map((r) => (
        <article key={r.id} className="rounded-xl border p-3 text-sm">
          <b>Tentativa de devolução</b>
          <p className="text-xs">{new Date(r.createdAt).toLocaleString("pt-BR")}</p>
          <p>{r.message}</p>
          {r.from && <p className="break-all text-xs">Origem: {r.from}</p>}
          {r.to && <p className="break-all text-xs">Destino: {r.to}</p>}
        </article>
      ))}
      {q.data?.hasMore && limit < 200 && (
        <Button variant="outline" onClick={() => setLimit((n) => Math.min(200, n + 30))}>
          Ver registros anteriores
        </Button>
      )}
      {q.data?.hasMore && limit === 200 && (
        <p className="text-xs">
          Exibindo os últimos 200 registros. Os hashes também podem ser consultados na BscScan.
        </p>
      )}
    </div>
  );
}
export function BotWithdrawalPanel({
  walletScope,
  walletName,
  sourceAddress,
  onDone,
}: {
  walletScope: string;
  walletName: string;
  sourceAddress?: string | null;
  onDone?: () => void | Promise<void>;
}) {
  const { user } = useAuth(),
    { wallets } = useSavedWallets(),
    client = useQueryClient();
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<"send" | "history">("send"),
    [assets, setAssets] = useState<string[]>([]),
    [to, setTo] = useState(""),
    [keep, setKeep] = useState("0.0001"),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false),
    [initialized, setInitialized] = useState(false);
  const q = useQuery({
    queryKey: ["withdrawal-wallet", user?.id, walletScope],
    queryFn: () => getBotWallet({ data: { walletScope } }),
    enabled: open && !!user,
    staleTime: 0,
    retry: false,
  });
  const mother = wallets.find((w) => w.id === walletScope);
  const legacy = walletScope === LEGACY_WALLET_SCOPE;
  const destination = mother?.address ?? to;
  const from = q.data?.address ?? sourceAddress;
  const mismatch = !!(
    sourceAddress &&
    q.data?.address &&
    sourceAddress.toLowerCase() !== q.data.address.toLowerCase()
  );
  const holdings = q.data?.tokens?.filter((t) => positive(t.amount)) ?? [];
  const incomplete = q.data?.bnb == null || q.data?.tokens?.some((t) => t.amount === "");
  useEffect(() => {
    setOpen(false);
    setInitialized(false);
    setAck(false);
    setMessage("");
    setTo("");
  }, [walletScope, sourceAddress]);
  useEffect(() => {
    if (open && q.data && !initialized) {
      setAssets([
        ...(q.data.tokens ?? []).filter((t) => positive(t.amount)).map((t) => t.address),
        ...(q.data.bnb != null && positive(q.data.bnb) ? ["BNB"] : []),
      ]);
      setInitialized(true);
    }
  }, [open, q.data, initialized]);
  const valid = botWithdrawalSchema.safeParse({
    walletScope,
    from,
    to: destination,
    assets,
    keepBnb: keep,
  }).success;
  const recipient = wallets.find((w) => w.address.toLowerCase() === destination.toLowerCase());
  const eligible =
    !!recipient && Date.now() - new Date(recipient.created_at).getTime() >= 24 * 3600 * 1000;
  const launch = (next: "send" | "history") => {
    setTab(next);
    setInitialized(false);
    setMessage("");
    setPending(false);
    setAck(false);
    setOpen(true);
  };
  const change = (asset: string) => {
    setAssets((a) => (a.includes(asset) ? a.filter((x) => x !== asset) : [...a, asset]));
    setAck(false);
  };
  const submit = async () => {
    if (!valid || !ack || !from || !eligible || mismatch || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await withdrawBot({
        data: { walletScope, from, to: destination, assets, keepBnb: keep },
      });
      setMessage(result.message);
      setPending(result.status === "pending");
      setAck(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["bot-withdrawals", user?.id, walletScope] }),
        client.invalidateQueries({ queryKey: ["funds-overview", user?.id] }),
        client.invalidateQueries({ queryKey: ["wallet-capital", walletScope] }),
        q.refetch(),
      ]);
      await onDone?.();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir. Confira os registros antes de tentar novamente.",
      );
      await client.invalidateQueries({ queryKey: ["bot-withdrawals", user?.id, walletScope] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="my-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => launch("send")}>
          Devolver ativos à carteira mãe
        </Button>
        <Button variant="ghost" size="sm" onClick={() => launch("history")}>
          Ver devoluções
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {tab === "send" ? "Devolver ativos" : "Devoluções do grupo"} ·{" "}
              {mother?.label || walletName}
            </DialogTitle>
            <DialogDescription>
              A carteira automática pertence a este grupo, independentemente do token selecionado na
              tela.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant={tab === "send" ? "default" : "outline"} onClick={() => setTab("send")}>
              Selecionar ativos
            </Button>
            <Button
              variant={tab === "history" ? "default" : "outline"}
              onClick={() => setTab("history")}
            >
              Histórico
            </Button>
          </div>
          {tab === "history" ? (
            <BotWithdrawalHistory walletScope={walletScope} enabled={open} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-secondary p-3 text-sm">
                <b>Origem · carteira automática</b>
                <p className="break-all font-mono text-xs">{from ?? "Consultando…"}</p>
                <b className="mt-3 block">Destino · carteira mãe</b>
                {mother ? (
                  <>
                    <p>{mother.label || "Carteira pessoal"}</p>
                    <p className="break-all font-mono text-xs">{destination}</p>
                  </>
                ) : legacy ? (
                  <>
                    <p className="my-2">
                      Carteira original sem mãe vinculada. Escolha explicitamente um endereço seu
                      salvo.
                    </p>
                    <select
                      aria-label="Carteira pessoal de destino"
                      className="w-full rounded-xl border bg-background p-3"
                      value={to}
                      disabled={busy}
                      onChange={(e) => {
                        setTo(e.target.value);
                        setAck(false);
                      }}
                    >
                      <option value="">Escolha o destino…</option>
                      {wallets.map((w) => (
                        <option key={w.id} value={w.address}>
                          {w.label || "Carteira"} · {w.address}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p role="alert">
                    Carteira mãe indisponível. Atualize as carteiras antes de continuar.
                  </p>
                )}
              </div>
              {q.isPending || q.isFetching ? <p>Consultando saldos atuais…</p> : null}
              {q.isError && (
                <p role="alert">
                  Não foi possível consultar os ativos.{" "}
                  <Button variant="outline" onClick={() => void q.refetch()}>
                    Atualizar
                  </Button>
                </p>
              )}
              {q.data && !q.data.address && (
                <p role="alert">Este grupo não tem uma carteira automática cadastrada.</p>
              )}
              {mismatch && (
                <p role="alert">A origem mudou. Feche e reabra esta carteira antes de devolver.</p>
              )}
              {incomplete && q.data && (
                <p role="alert" className="text-sm">
                  Consulta parcial. Tokens sem saldo confirmado não podem ser selecionados. A
                  devolução de BNB depende de conferir os ativos e preservar gás.
                </p>
              )}
              <fieldset disabled={busy} className="space-y-3">
                <legend className="mb-2 font-semibold">Quais ativos deseja devolver?</legend>
                {holdings.map((t) => (
                  <label
                    key={t.address}
                    className="flex items-start gap-3 rounded-xl border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={assets.includes(t.address)}
                      onChange={() => change(t.address)}
                    />
                    <span>
                      <b>{t.symbol}</b> · {formatFundAmount(t.amount, 10)}
                      <span className="block break-all text-xs text-muted-foreground">
                        {t.address}
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={assets.includes("BNB")}
                    disabled={q.data?.bnb == null}
                    onChange={() => change("BNB")}
                  />
                  <span>
                    <b>BNB</b> · {q.data?.bnb ?? "Indisponível"} · enviado por último
                  </span>
                </label>
                <label className="block text-sm">
                  Reserva de BNB a manter
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={keep}
                    onChange={(e) => {
                      setKeep(e.target.value);
                      setAck(false);
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Os tokens escolhidos são transferidos primeiro, um por vez. BNB só é enviado
                  depois de confirmá-los. Se restarem tokens conhecidos, preservamos também o gás
                  estimado para retirá-los. Tokens com taxa podem entregar uma quantidade menor;
                  isso não é uma venda.
                </p>
              </fieldset>
              {!eligible && destination && (
                <p className="text-sm">O destino precisa estar salvo há pelo menos 24 horas.</p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                Conferi origem, destino e ativos. Autorizo pausar os robôs deste grupo e devolver os
                ativos selecionados. Os outros grupos continuam como estão.
              </label>
              <Button
                className="w-full"
                disabled={
                  busy ||
                  pending ||
                  q.isFetching ||
                  q.isError ||
                  !q.data?.address ||
                  !ack ||
                  !valid ||
                  !eligible ||
                  mismatch
                }
                onClick={() => void submit()}
              >
                {busy ? "Processando · acompanhe o histórico" : "Pausar grupo e devolver seleção"}
              </Button>
              {message && (
                <p role="status" className="rounded-xl border p-3 text-sm">
                  {message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                A consulta cobre tokens conhecidos, cadastrados e usados pelos bots. O gás futuro é
                uma estimativa e pode mudar. Um token recebido fora dessa lista precisa ser
                cadastrado para ser localizado; não prometemos descobrir todos os contratos
                existentes na rede.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
