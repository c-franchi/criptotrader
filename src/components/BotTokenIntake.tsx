import { Component, useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Panel } from "./AppShell";
import {
  initialSellDraftKey,
  initialSellDraftSchema,
  initialSellQuantity,
  validSellDraftForWallet,
  type InitialSellDraft,
} from "@/lib/initialSellPlan";
import { formatFundAmount } from "@/lib/fundsOverview";

/** An invalid holding or rendering fault must not take down the entire trading page. */
export class BotTokenIntakeBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed)
      return (
        <section role="alert" className="rounded-lg border border-warning/40 p-4 text-sm">
          <p>O painel de tokens não pôde ser exibido. O restante do robô permanece disponível.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => this.setState({ failed: false })}
          >
            Tentar carregar tokens novamente
          </Button>
        </section>
      );
    return this.props.children;
  }
}

type Holding = { address: string; symbol: string; amount: string; unavailable?: boolean };
type StartMode = InitialSellDraft["mode"];

export function BotTokenIntake({
  userId,
  walletScope,
  walletName,
  walletAddress,
  bnb,
  holdings,
  token,
  symbol,
  botArmed,
  botPositionTokens,
  onSelectToken,
  onRefresh,
}: {
  userId: string;
  walletScope: string;
  walletName: string;
  walletAddress: string;
  bnb: string | null;
  holdings: Holding[];
  token: string;
  symbol: string;
  botArmed: boolean;
  botPositionTokens: number;
  onSelectToken: (address: string) => void;
  onRefresh: () => void;
}) {
  const [mode, setMode] = useState<StartMode>("sell_only");
  const [sharePct, setSharePct] = useState(100);
  const [minPrice, setMinPrice] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<InitialSellDraft | null>(null);
  const draftKey = initialSellDraftKey(userId, walletScope, walletAddress, token);
  const selected = holdings.find((h) => h.address.toLowerCase() === token.toLowerCase());
  const balance =
    selected && !selected.unavailable && selected.amount !== "" ? selected.amount : null;
  const quantity = balance != null ? initialSellQuantity(balance, sharePct) : null;
  const hasPosition = botPositionTokens > 0;
  const onChainPositive = holdings.filter(
    (h) => !h.unavailable && h.amount !== "" && Number(h.amount) > 0,
  );

  useEffect(() => {
    setMode("sell_only");
    setSharePct(100);
    setMinPrice("");
    setNotice("");
    setSaved(null);
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = initialSellDraftSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return;
      const draft = parsed.data;
      setMode(draft.mode);
      setSharePct(draft.sharePct);
      setMinPrice(draft.minPriceBnb);
      setSaved(draft);
    } catch {
      // A failed local draft must never prevent viewing on-chain balances.
    }
  }, [draftKey]);

  const currentDraftValid =
    balance != null && saved != null
      ? validSellDraftForWallet(saved, walletAddress, token, balance)
      : false;
  const draftInput = {
    version: 1 as const,
    mode,
    sharePct,
    minPriceBnb: minPrice.trim().replace(",", "."),
    balanceSnapshot: balance ?? "",
    tokenAddress: token,
    walletAddress,
    createdAt: new Date().toISOString(),
  };
  const valid = initialSellDraftSchema.safeParse(draftInput);
  const save = () => {
    if (!valid.success || balance == null) {
      setNotice(valid.error?.issues[0]?.message ?? "Confirme o saldo e o preço.");
      return;
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify(valid.data));
      setSaved(valid.data);
      setNotice(
        "Pré-configuração guardada neste aparelho. Nenhum robô foi ativado e nenhuma ordem foi enviada.",
      );
    } catch {
      setNotice("O armazenamento local não está disponível. Nenhuma operação foi enviada.");
    }
  };

  return (
    <Panel title={`Ativos e venda inicial · ${walletName}`}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Consulte o saldo real da carteira automática na BSC antes de configurar um robô.
          Transferir tokens para a carteira não os registra automaticamente como compras do robô.
        </p>
        <p className="text-xs text-warning">
          Antes de transferir GTE para o endereço abaixo, confirme que existe backup recuperável da
          carteira automática e uma cópia segura da chave de criptografia do executor.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-xs break-all" title={walletAddress}>
            {walletAddress}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(walletAddress)
                  .then(() => setNotice("Endereço da carteira automática copiado."))
                  .catch(() => setNotice("Não foi possível copiar. Utilize o endereço acima."));
              }}
            >
              Copiar endereço
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
              Atualizar saldos
            </Button>
          </div>
        </div>
        <p>
          <strong>BNB para operações/gás: </strong>
          {bnb == null ? "Consulta indisponível" : `${formatFundAmount(bnb, 10)} BNB`}
        </p>
        <div className="rounded-xl border p-3">
          <p className="font-semibold">Tokens identificados nesta carteira</p>
          {onChainPositive.length ? (
            <ul className="mt-2 space-y-2">
              {onChainPositive.map((h) => (
                <li key={h.address} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <strong>{h.symbol}</strong> ·{" "}
                    <span className="font-mono tabular-nums">{formatFundAmount(h.amount, 12)}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      h.address.toLowerCase() === token.toLowerCase() ? "secondary" : "outline"
                    }
                    onClick={() => onSelectToken(h.address)}
                  >
                    {h.address.toLowerCase() === token.toLowerCase()
                      ? "Selecionado"
                      : `Configurar ${h.symbol}`}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted-foreground">
              Nenhum saldo positivo confirmado entre os tokens cadastrados ou monitorados.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            A rede BSC não fornece uma lista completa de todos os tokens por endereço nessa
            consulta. Se um token não aparecer, cadastre seu contrato e atualize os saldos. Saldos
            que falharam na consulta não são considerados zero.
          </p>
        </div>
        <div className="space-y-3 rounded-xl border border-border p-3">
          <h3 className="font-semibold">Como deseja começar com {symbol}?</h3>
          {balance == null ? (
            <p role="status" className="text-muted-foreground">
              Saldo de {symbol} ainda não confirmado nesta carteira. Cadastre o contrato correto,
              confira a rede BSC e atualize antes de planejar uma venda.
            </p>
          ) : Number(balance) <= 0 ? (
            <p role="status" className="text-muted-foreground">
              Saldo de {symbol}: 0. Você poderá preparar a venda após confirmar o recebimento dos
              tokens nesta carteira.
            </p>
          ) : (
            <>
              <p className="tabular-nums">
                <strong>Saldo on-chain de {symbol}:</strong> {formatFundAmount(balance, 12)}{" "}
                {symbol}
              </p>
              {hasPosition && (
                <p role="alert" className="text-warning">
                  Já existe uma posição do robô registrada para este token. O saldo blockchain pode
                  incluir essa posição. Não é seguro atribuir o total à nova venda.
                </p>
              )}
              {botArmed && (
                <p role="alert" className="text-warning">
                  O robô atual está ligado. Esta pré-configuração não altera nem substitui suas
                  regras e não pode iniciar uma nova venda.
                </p>
              )}
              <fieldset className="space-y-2">
                <legend className="font-semibold">Primeira ação pretendida</legend>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    checked={mode === "sell_only"}
                    onChange={() => {
                      setMode("sell_only");
                      setNotice("");
                    }}
                  />
                  <span>
                    <strong>Somente vender</strong> — uma venda inicial; depois encerrar a
                    atividade.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    checked={mode === "sell_then_review"}
                    onChange={() => {
                      setMode("sell_then_review");
                      setNotice("");
                    }}
                  />
                  <span>
                    <strong>Vender primeiro e continuar</strong> — depois de confirmar a venda e o
                    BNB realmente recebido, revisar e liberar uma estratégia de compras/vendas.
                  </span>
                </label>
              </fieldset>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span>Percentual do saldo para a venda</span>
                  <select
                    className="w-full rounded-md border border-input bg-background p-2"
                    aria-label="Percentual do saldo para venda"
                    value={sharePct}
                    onChange={(e) => {
                      setSharePct(Number(e.target.value));
                      setNotice("");
                    }}
                  >
                    {[25, 50, 75, 100].map((v) => (
                      <option key={v} value={v}>
                        {v}%
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span>Preço mínimo desejado (BNB por {symbol})</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00000001"
                    aria-label="Preço mínimo BNB por token"
                    value={minPrice}
                    onChange={(e) => {
                      setMinPrice(e.target.value);
                      setNotice("");
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Quantidade planejada:{" "}
                <strong>
                  {quantity ?? "—"} {symbol}
                </strong>
                . A quantidade efetivamente recebida pelo swap pode variar por taxas, liquidez e
                execução. Sem preço de compra comprovado, lucro/prejuízo fica{" "}
                <strong>indeterminado</strong>.
              </p>
              {saved && !currentDraftValid && (
                <p role="alert" className="text-warning">
                  O saldo mudou desde a pré-configuração ou deixou de estar disponível. Refaça a
                  conferência antes de usar este plano.
                </p>
              )}
              {saved && currentDraftValid && (
                <p role="status" className="text-muted-foreground">
                  Existe uma pré-configuração local para este token e carteira. Ela ainda não possui
                  execução automática habilitada.
                </p>
              )}
              <Button
                type="button"
                disabled={!valid.success || botArmed || hasPosition}
                onClick={save}
              >
                Guardar plano de venda (sem ativar)
              </Button>
              {notice && (
                <p role="status" className="text-muted-foreground">
                  {notice}
                </p>
              )}
              {(botArmed || hasPosition) && (
                <p className="text-xs text-warning">
                  A preparação fica bloqueada enquanto o bot estiver ativo ou com posição
                  registrada, para não duplicar vendas nem misturar posições.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Esta é uma pré-configuração salva somente no aparelho. O executor atual não vende
                tokens transferidos manualmente. A automação exigirá validação de saldo, reserva de
                gás, taxas, posição, transações pendentes e conciliação antes de ser
                disponibilizada. Nenhum botão desta seção envia swaps.
              </p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
