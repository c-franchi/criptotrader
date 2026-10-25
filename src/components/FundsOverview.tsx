import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronDown, RefreshCw, Wallet } from "lucide-react";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { useCurrency } from "@/hooks/currencyContext";
import { FiatValue } from "@/hooks/useCurrency";
import { fiatEstimate, formatFiat } from "@/lib/fiat";
import { getFundsOverview } from "@/lib/fundsOverview.functions";
import {
  fundsTotal,
  formatFundAmount,
  fundWalletAssets,
  type FundWallet,
} from "@/lib/fundsOverview";
import { Panel } from "./AppShell";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { TokenLogo } from "./TokenLogo";

export function FundsOverview() {
  const { user } = useAuth();
  const userId = user?.id;
  const { tokens } = useSelectedToken();
  const { walletScope, address } = useSelectedWallet();
  const { currency, quote } = useCurrency();
  const client = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selection, setSelection] = useState({ userId: "", address: "" });
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["funds-overview", user?.id],
    enabled: !!user,
    queryFn: () => getFundsOverview(),
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
  useEffect(() => {
    let saved = "";
    try {
      saved = userId ? (localStorage.getItem(`cryptobot:funds-wallet:${userId}`) ?? "") : "";
    } catch {
      /* optional storage */
    }
    setSelection({ userId: userId ?? "", address: saved });
    setPickerOpen(false);
    setExpandedFor(null);
  }, [userId]);
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["funds-overview", user?.id] });
    };
    window.addEventListener("wallets-changed", refresh);
    return () => window.removeEventListener("wallets-changed", refresh);
  }, [client, user?.id]);
  if (!user) return null;
  const wallets = q.data?.wallets ?? [];
  const selected =
    wallets.find(
      (w) =>
        selection.userId === user.id && w.address.toLowerCase() === selection.address.toLowerCase(),
    ) ??
    wallets.find((w) => address && w.address.toLowerCase() === address.toLowerCase()) ??
    wallets.find((w) => w.scopes.includes(walletScope)) ??
    wallets[0];
  const total = fundsTotal(wallets);
  const local = (value: string | null) => {
    const amount = fiatEstimate(value, "BNB", currency, quote);
    return value == null
      ? "Não apurado"
      : amount == null
        ? `${formatFundAmount(value, 10)} BNB`
        : formatFiat(amount, currency);
  };
  const choose = (w: FundWallet) => {
    setSelection({ userId: user.id, address: w.address });
    setExpandedFor(null);
    setPickerOpen(false);
    try {
      localStorage.setItem(`cryptobot:funds-wallet:${user.id}`, w.address);
    } catch {
      /* keep in memory */
    }
  };
  const selectedTotal = selected ? fundsTotal([selected]) : null;
  const assets = selected ? fundWalletAssets(selected) : [];
  const expanded = !!selected && expandedFor === selected.address;
  const shown = expanded ? assets : assets.slice(0, 4);
  const SelectedIcon = selected?.bot ? Bot : Wallet;
  return (
    <div className="mb-5" data-funds-overview>
      <Panel title="Sua carteira">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogTrigger asChild>
              <Button
                variant="secondary"
                className="h-auto min-w-0 max-w-[85%] justify-start gap-2 rounded-full px-3 py-2.5"
                aria-label={`Escolher carteira: ${selected?.label ?? "Carteiras"}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <SelectedIcon className="size-5" aria-hidden="true" />
                </span>
                <span className="truncate text-base font-semibold">
                  {selected?.label ?? "Carteiras"}
                </span>
                <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
              <DialogTitle>Escolher carteira</DialogTitle>
              <DialogDescription>Veja o saldo e os tokens de cada carteira.</DialogDescription>
              <div role="group" aria-label="Carteiras disponíveis" className="space-y-2">
                {wallets.map((w) => {
                  const Icon = w.bot ? Bot : Wallet;
                  const subtotal = fundsTotal([w]);
                  const checked = w.address === selected?.address;
                  return (
                    <button
                      type="button"
                      key={w.address}
                      aria-pressed={checked}
                      onClick={() => choose(w)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-semibold">{w.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {w.bot ? "Robôs" : "Pessoal"} · {w.address.slice(0, 6)}…
                          {w.address.slice(-4)}
                        </span>
                        <span className="block text-sm tabular-nums">
                          {local(subtotal.total ?? subtotal.known)}
                          {!subtotal.complete ? " · parcial" : ""}
                        </span>
                      </span>
                      {checked && (
                        <Check className="size-5 shrink-0 text-primary" aria-label="Selecionada" />
                      )}
                    </button>
                  );
                })}
              </div>
              <Button asChild variant="secondary" className="w-full rounded-full">
                <a href="/carteiras#adicionar-carteira" onClick={() => setPickerOpen(false)}>
                  Adicionar ou gerenciar carteiras
                </a>
              </Button>
            </DialogContent>
          </Dialog>
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0 rounded-full"
            aria-label="Atualizar saldos"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw className={`size-5 ${q.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {q.isError && (
          <p role="alert" className="mb-3 text-sm text-warning">
            Não foi possível atualizar os saldos.
            {q.data ? " Abaixo está a última consulta, com seu horário." : " Tente novamente."}
          </p>
        )}
        {!q.data ? (
          <p role="status" className="text-sm text-muted-foreground">
            {q.isPending ? "Consultando carteiras e robôs na rede…" : "Saldos indisponíveis."}
          </p>
        ) : selected && selectedTotal ? (
          <>
            <div className="py-3">
              <p className="text-sm text-muted-foreground">
                {selectedTotal.complete
                  ? q.isError
                    ? "Último saldo consultado"
                    : "Valor da carteira · estimativa"
                  : "Consulta parcial · subtotal apurado"}
              </p>
              <p className="mt-1 break-words text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
                {local(selectedTotal.total ?? selectedTotal.known)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {selected.bot ? "Carteira dos robôs · saldo compartilhado" : "Carteira pessoal"}
                {selected.bot && selected.personal ? " · também cadastrada como pessoal" : ""}
              </p>
            </div>
            {!selectedTotal.complete && (
              <p role="status" className="mt-3 text-sm text-warning">
                Há saldo ou tokens sem consulta/cotação. O total completo ainda está indisponível; o
                subtotal soma apenas valores apurados.
              </p>
            )}
            <section aria-label={`Tokens de ${selected.label}`} className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Tokens</h3>
                {assets.length > 4 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={expanded}
                    aria-controls="wallet-fund-tokens"
                    onClick={() => setExpandedFor(expanded ? null : selected.address)}
                  >
                    {expanded ? "Mostrar menos" : `Ver todos (${assets.length})`}
                  </Button>
                )}
              </div>
              <ul id="wallet-fund-tokens" className="mt-1 divide-y divide-border">
                {shown.map((a) => {
                  const name =
                    tokens.find((t) => t.address.toLowerCase() === a.address.toLowerCase())?.name ??
                    a.name;
                  return (
                    <li key={a.address} className="flex items-center gap-3 py-4">
                      <TokenLogo address={a.address} symbol={a.symbol} logoUrl={a.logoUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold sm:text-base">{name}</p>
                        <p
                          className="mt-1 break-all text-xs tabular-nums text-muted-foreground"
                          title={a.amount == null ? undefined : `${a.amount} ${a.symbol}`}
                        >
                          {a.amount == null ? "Saldo indisponível" : formatFundAmount(a.amount, 10)}{" "}
                          {a.symbol}
                        </p>
                      </div>
                      <div className="min-w-0 max-w-[48%] text-right">
                        <p className="break-words text-base font-semibold tabular-nums">
                          {local(a.value)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {a.value == null ? "Cotação ou saldo indisponível" : "Valor estimado"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <details className="mt-3 border-t border-border pt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Endereço e reservas
              </summary>
              <a
                href={`https://bscscan.com/address/${selected.address}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block break-all font-mono text-xs text-primary underline"
              >
                {selected.address}
              </a>
              {selected.capital && (
                <dl className="mt-3 space-y-3 text-xs">
                  {[
                    ["Reserva planejada para compras", selected.capital.reserved],
                    ["Reserva para gás", selected.capital.gas],
                    ["BNB sem reserva dos robôs", selected.capital.free],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-wrap justify-between gap-1">
                      <dt>{label}</dt>
                      <dd className="break-all text-right">
                        {value == null
                          ? "Aguardando verificação das operações"
                          : `${formatFundAmount(value)} BNB`}
                        {value != null && <FiatValue bnb={value} />}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {selected.capital && Number(selected.capital.shortfall ?? 0) > 0 && (
                <p className="mt-2 text-xs text-warning">
                  As reservas planejadas excedem o saldo: faltam{" "}
                  {formatFundAmount(selected.capital.shortfall!)} BNB.
                </p>
              )}
              {selected.bot && !selected.capital && (
                <p className="mt-2 text-xs text-warning">
                  Divisão das reservas indisponível nesta consulta.
                </p>
              )}
            </details>
            {selected.issues.map((issue) => (
              <p key={issue} className="mt-2 text-xs text-warning">
                {issue}
              </p>
            ))}
            <details className="mt-4 rounded-xl bg-muted/40 p-3">
              <summary className="cursor-pointer text-sm">
                Total de fundos · todas as carteiras{" "}
                <strong className="ml-1 tabular-nums">{local(total.total ?? total.known)}</strong>
                {!total.complete ? " · parcial" : ""}
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Carteiras pessoais + carteiras dos robôs. Cada endereço é contado uma vez. Reservas
                já estão incluídas no BNB; o custo das compras não é saldo adicional.
              </p>
            </details>
            <p className="mt-4 text-xs text-muted-foreground">
              Tokens populares e cadastrados são consultados; adicione outros para incluí-los.
              Valores de mercado são estimativas, antes de taxas de venda.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Saldos consultados em {new Date(q.data.balanceAt).toLocaleString("pt-BR")}.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma carteira cadastrada.{" "}
            <a className="text-primary underline" href="/carteiras#adicionar-carteira">
              Adicionar carteira
            </a>
          </p>
        )}
      </Panel>
    </div>
  );
}
