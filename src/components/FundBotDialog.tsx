import { verifyWalletSession } from "@/lib/walletSession";
import { fundingTransfer } from "@/lib/fundingTransfer";
import { TokenPicker } from "@/components/TokenPicker";
import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { getFxQuote } from "@/lib/fx.functions";
import { toast } from "sonner";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { bsc } from "viem/chains";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectWallet, isUnknownMethod, resetWallet } from "@/lib/walletConnect";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { erc20Abi } from "@/lib/pancake";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { missingBnb } from "@/lib/botFunding";

const pub = () =>
  createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });
const BIG_BRL = 200,
  BIG_BNB = 0.5; // acima disso mostramos um aviso de prudência
const hex = (v: bigint) => `0x${v.toString(16)}`;
type Req = {
  disconnect: () => Promise<void>;
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/** Sends BNB or a token from the user's personal wallet (signed in their own app) to the robot wallet. */
export function FundBotDialog({
  botAddress,
  sourceAddress,
  onDone,
  botBnb,
  need,
}: {
  botAddress: string;
  sourceAddress?: string | null | undefined;
  onDone?: () => void;
  botBnb?: number | null;
  need?: { reserve: number; trade: number; total: number } | null;
}) {
  const { tokens } = useSelectedToken();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [asset, setAsset] = useState<string>("BNB"); // "BNB" or token address
  const [bnbBal, setBnbBal] = useState<number | null>(null);
  const [tokBal, setTokBal] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feeBnb, setFeeBnb] = useState<number | null>(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [feeError, setFeeError] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [unit, setUnit] = useState<"BRL" | "BNB">("BRL");
  const [brlPerBnb, setBrlPerBnb] = useState<number | null>(null);
  const providerRef = useRef<Req | null>(null);
  const stopListening = useRef<(() => void) | null>(null);
  useEffect(() => () => stopListening.current?.(), []);
  const tok = asset === "BNB" ? null : (tokens.find((t) => t.address === asset) ?? null);
  const isBnb = asset === "BNB";

  useEffect(() => {
    if (open)
      getFxQuote()
        .then((q) => setBrlPerBnb(q.bnbUsd && q.usdBrl ? q.bnbUsd * q.usdBrl : null))
        .catch(() => {});
  }, [open]);
  useEffect(() => {
    setTokBal(null);
    setAmount("");
    if (!account || !tok) return;
    let alive = true;
    pub()
      .readContract({
        address: tok.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account as `0x${string}`],
      })
      .then((b) => {
        if (alive) setTokBal(Number(formatUnits(b, tok.decimals)));
      })
      .catch(() => {
        if (alive) setTokBal(null);
      });
    return () => {
      alive = false;
    };
  }, [account, asset]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy("Conectando…");
    try {
      const provider = await connectWallet(sourceAddress ?? undefined);
      providerRef.current = provider as unknown as Req;
      const invalidate = () => {
        setAccount(null);
        setBnbBal(null);
        setTokBal(null);
        setAmount("");
        toast.warning("A conta ou rede mudou. Reconecte a carteira dos ativos antes de enviar.");
      };
      stopListening.current?.();
      provider.on?.("accountsChanged", invalidate);
      provider.on?.("chainChanged", invalidate);
      stopListening.current = () => {
        provider.removeListener?.("accountsChanged", invalidate);
        provider.removeListener?.("chainChanged", invalidate);
      };
      const a = provider.accounts[0] ?? null;
      setAccount(a);
      if (a)
        setBnbBal(Number(formatEther(await pub().getBalance({ address: a as `0x${string}` }))));
    } catch (e) {
      toast.error((e as Error).message || "Conexão cancelada");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    stopListening.current?.();
    await resetWallet();
    providerRef.current = null;
    setAccount(null);
    setBnbBal(null);
    setTokBal(null);
    setAmount("");
    toast.success("Carteira desconectada do CryptoBot");
  };

  const floor6 = (v: number) => Math.floor(v * 1e9) / 1e9;
  const useBrl = isBnb && unit === "BRL";
  const typed = Number(amount.replace(",", "."));
  const n = floor6(useBrl ? (brlPerBnb ? typed / brlPerBnb : 0) : typed);
  useEffect(() => {
    setFeeBnb(null);
    setFeeError(false);
    if (!open || !account || (!isBnb && !(n > 0))) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const p = pub();
        const [gasPrice, balance] = await Promise.all([
          p.getGasPrice(),
          p.getBalance({ address: account as `0x${string}` }),
        ]);
        if (alive) setBnbBal(Number(formatEther(balance)));
        const gas = await p.estimateGas({
          account: account as `0x${string}`,
          to: (isBnb ? botAddress : tok!.address) as `0x${string}`,
          value: 0n,
          data: isBnb
            ? "0x"
            : encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [
                  botAddress as `0x${string}`,
                  parseUnits(n.toFixed(Math.min(9, tok!.decimals)), tok!.decimals),
                ],
              }),
        });
        if (alive) setFeeBnb(Number(formatEther(((gas * 12n + 9n) / 10n) * gasPrice)));
      } catch {
        if (alive) setFeeError(true);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, account, asset, botAddress, isBnb, n, quoteRevision, tok]);
  const max = isBnb
    ? bnbBal != null && feeBnb != null
      ? floor6(Math.max(bnbBal - feeBnb, 0))
      : 0
    : tokBal != null
      ? floor6(tokBal)
      : 0;
  const gasOk = feeBnb != null && bnbBal != null && bnbBal >= feeBnb;
  const miss = isBnb && need && botBnb != null ? missingBnb(need.total, botBnb, n) : 0;
  // Funding can be partial; only the wallet's balance and estimated transfer fee gate sending.
  const valid =
    n > 0 &&
    n <= max &&
    gasOk &&
    (isBnb || !!tok) &&
    (!sourceAddress || account?.toLowerCase() === sourceAddress.toLowerCase());
  const pct = max > 0 ? Math.min(100, Math.round((n / max) * 100)) : 0;
  const sym = isBnb ? "BNB" : (tok?.symbol ?? "Token indisponível");
  const brl = (bnb: number) =>
    brlPerBnb
      ? (bnb * brlPerBnb).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—";
  const big = isBnb && (n >= BIG_BNB || (brlPerBnb != null && n * brlPerBnb >= BIG_BRL));
  const setVal = (v0: number) => {
    const v = floor6(v0);
    setAmount(useBrl && brlPerBnb ? (v * brlPerBnb).toFixed(2) : String(v));
  };
  const switchUnit = (u: "BRL" | "BNB") => {
    if (u === unit) return;
    setUnit(u);
    if (n > 0) setAmount(u === "BRL" && brlPerBnb ? (n * brlPerBnb).toFixed(2) : String(n));
  };

  const send = async () => {
    const provider = providerRef.current;
    if (!account || !valid || !provider) return;
    if (account.toLowerCase() === botAddress.toLowerCase())
      return void toast.error("Essa já é a carteira do robô");
    setBusy("Confirme no app da sua carteira…");
    try {
      const p = pub();
      const from = account as `0x${string}`;
      await verifyWalletSession(provider, sourceAddress ?? from);
      if (!isBnb && !tok) throw new Error("Escolha novamente o token a enviar.");
      const tx = fundingTransfer(
        from,
        botAddress,
        isBnb ? null : tok!.address,
        isBnb
          ? parseEther(n.toFixed(9))
          : parseUnits(n.toFixed(Math.min(9, tok!.decimals)), tok!.decimals),
      );
      const [gasPrice, gas] = await Promise.all([
        p.getGasPrice(),
        p
          .estimateGas({
            account: from,
            to: tx.to as `0x${string}`,
            value: BigInt(tx.value),
            data: tx.data,
          })
          .then((g) => (g * 12n + 9n) / 10n),
      ]);
      const freshBalance = await p.getBalance({ address: from });
      if (freshBalance < BigInt(tx.value) + gas * gasPrice)
        throw new Error(
          "O saldo precisa cobrir o envio e a taxa estimada da rede. Reduza um pouco o valor.",
        );
      await verifyWalletSession(provider, sourceAddress ?? from);
      const h = (await provider.request({
        method: "eth_sendTransaction",
        params: [{ ...tx, gas: hex(gas), gasPrice: hex(gasPrice), chainId: hex(56n) }],
      })) as `0x${string}`;
      setHash(h);
      setBusy("Aguardando a rede confirmar…");
      const r = await p.waitForTransactionReceipt({ hash: h, timeout: 90_000 });
      if (r.status !== "success") throw new Error("A rede recusou a transferência");
      toast.success(`${n} ${sym} enviados para o robô`);
      const { data: u } = await supabase.auth.getUser();
      if (u.user)
        await supabase.from("audit_log").insert({
          user_id: u.user.id,
          action: "bot_funded",
          details: { asset: sym, amount: n, from, hash: h },
        });
      onDone?.();
      setBusy(null);
      // Fecha a janela sozinha e volta para a tela do robô após a confirmação.
      await new Promise((res) => setTimeout(res, 1600));
      close(false);
    } catch (e) {
      if (isUnknownMethod(e)) {
        await resetWallet();
        providerRef.current = null;
        setAccount(null);
        setBnbBal(null);
        toast.error(
          "A carteira não reconheceu o pedido. Conecte de novo (passo 1) e tente outra vez — nada foi enviado.",
        );
      } else toast.error(((e as Error).message || "Transferência cancelada").split("\n")[0]!);
    } finally {
      setBusy(null);
    }
  };

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setAmount("");
      setHash(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button size="sm">Enviar da minha carteira</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abastecer o robô</DialogTitle>
          <DialogDescription>
            Você envia BNB ou tokens da sua carteira para a carteira do robô. Quem confirma é você,
            no app da sua carteira — o CryptoBot nunca pede sua senha ou frase secreta.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li
            className={`rounded-md border p-3 ${account ? "border-success/40 bg-success/5" : "border-primary/40"}`}
          >
            <p className="font-medium">1. Conectar sua carteira</p>
            {account ? (
              <>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {account}
                  <br />
                  Saldo:{" "}
                  {bnbBal != null
                    ? `${bnbBal.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB`
                    : "—"}
                </p>
                <Button className="mt-2" size="sm" variant="outline" onClick={disconnect}>
                  Desconectar carteira
                </Button>
              </>
            ) : (
              <Button className="mt-2" size="sm" disabled={!!busy} onClick={connect}>
                {busy ?? "Conectar carteira"}
              </Button>
            )}
          </li>
          <li
            className={`rounded-md border p-3 ${account ? "border-primary/40" : "border-border opacity-60"}`}
          >
            <p className="font-medium">2. O que e quanto enviar?</p>
            <TokenPicker
              label="Ativo a enviar"
              tokens={[
                { address: "BNB", symbol: "BNB", name: "Para comprar e pagar o gás" },
                ...tokens,
              ]}
              value={asset}
              onChange={setAsset}
              disabled={!account || !!busy}
            />
            {isBnb && (
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
                {(["BRL", "BNB"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => switchUnit(u)}
                    disabled={!!busy || (u === "BRL" && !brlPerBnb)}
                    className={`rounded px-2 py-1 text-xs font-semibold ${unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {u === "BRL" ? "Em reais (R$)" : "Em BNB"}
                  </button>
                ))}
              </div>
            )}
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {useBrl ? "R$" : sym}
              </span>
              <Input
                className="pl-16 text-base"
                inputMode="decimal"
                placeholder={useBrl ? "100,00" : "0"}
                disabled={!account || !!busy}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {n > 0 && (
              <p className="mt-1 text-sm">
                ={" "}
                <strong className="font-mono text-primary">
                  {n.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {sym}
                </strong>
                {isBnb && <span className="text-muted-foreground"> ≈ {brl(n)}</span>}
              </p>
            )}
            {useBrl && (
              <div className="mt-2 grid grid-cols-4 gap-1">
                {[25, 50, 100, 200].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!account || !brlPerBnb || v / brlPerBnb > max}
                    onClick={() => setAmount(v.toFixed(2))}
                  >
                    R$ {v}
                  </Button>
                ))}
              </div>
            )}
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={pct === p ? "default" : "outline"}
                  disabled={!account || !!busy || max <= 0}
                  onClick={() => setVal((max * p) / 100)}
                >
                  {p === 100 ? "Máx" : `${p}%`}
                </Button>
              ))}
            </div>
            <Slider
              className="mt-4"
              min={0}
              max={100}
              step={1}
              value={[pct]}
              disabled={!account || !!busy || max <= 0}
              onValueChange={([v]) => setVal((max * (v ?? 0)) / 100)}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Disponível: {max.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {sym}
              {isBnb
                ? ` ≈ ${brl(max)} (descontada a estimativa do gás deste envio).`
                : tokBal == null && account
                  ? " (consultando…)"
                  : "."}
            </p>
            {account && (
              <p className="mt-2 text-xs text-muted-foreground">
                Taxa estimada do envio:{" "}
                {feeBnb == null
                  ? feeError
                    ? "indisponível"
                    : "calculando…"
                  : `${feeBnb.toLocaleString("pt-BR", { maximumFractionDigits: 9 })} BNB (≈ ${brl(feeBnb)})`}
                . Inclui margem de 20% no limite de gás; o custo final pode variar.{" "}
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => setQuoteRevision((v) => v + 1)}
                >
                  Atualizar estimativa
                </button>
              </p>
            )}
            {!gasOk && feeBnb != null && account && (
              <p className="mt-1 text-xs text-destructive">
                Você precisa de um pouco de BNB na sua carteira para pagar a taxa da rede deste
                envio.
              </p>
            )}
            {account && n > max && (!isBnb || feeBnb != null) && (
              <p className="mt-1 text-xs text-destructive">Valor maior que o disponível.</p>
            )}
            {account && n > 0 && miss > 0 && need && (
              <div className="mt-2 rounded border border-warning/50 bg-warning/10 p-2 text-xs space-y-1">
                <p className="font-semibold">
                  Depósito parcial · reserva da estratégia ainda não coberta
                </p>
                <p>
                  A configuração atual considera um saldo de referência de{" "}
                  <strong>
                    {need.total.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB
                  </strong>{" "}
                  (≈ {brl(need.total)}):
                </p>
                <p>
                  {need.trade > 0 ? (
                    <>
                      • {need.trade.toLocaleString("pt-BR", { maximumFractionDigits: 9 })} BNB por
                      compra ({brl(need.trade)})<br />
                    </>
                  ) : (
                    <>
                      • Compra calculada como porcentagem do saldo disponível.
                      <br />
                    </>
                  )}
                  • {need.reserve} BNB de reserva configurada ({brl(need.reserve)})
                </p>
                <p>
                  O robô já tem{" "}
                  {(botBnb ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB. Faltam{" "}
                  <strong>
                    {miss.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB (≈ {brl(miss)})
                  </strong>
                  .
                </p>
                <p className="text-muted-foreground">
                  Você pode enviar este valor agora e complementar depois. A reserva não é o custo
                  de uma transação. Para usar um valor menor na estratégia, ajuste a reserva e
                  aplique a mudança antes de iniciar compras.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={n + miss > max}
                    onClick={() => setVal(n + miss)}
                  >
                    Completar saldo de referência
                  </Button>
                  <Button asChild type="button" size="sm" variant="outline">
                    <Link to="/estrategia" hash="strategy-gas" onClick={() => setOpen(false)}>
                      Ajustar reserva de gás
                    </Link>
                  </Button>
                </div>
              </div>
            )}
            {big && (
              <p className="mt-2 rounded border border-warning/50 bg-warning/10 p-2 text-xs">
                ⚠️ Valor alto para começar. Recomendamos testar primeiro com pouco (ex.: R$ 50) e só
                aumentar depois de ver o robô funcionando com a sua estratégia.
              </p>
            )}
            {!isBnb && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Atenção: alguns tokens cobram taxa até em transferências; o robô pode receber um
                pouco menos. Lembre que o robô também precisa de BNB para o gás.
              </p>
            )}
          </li>
          <li
            className={`rounded-md border p-3 ${valid ? "border-primary/40" : "border-border opacity-60"}`}
          >
            <p className="font-medium">3. Confirmar</p>
            <div className="mt-2 rounded border border-success/40 bg-success/5 p-2 text-xs">
              <p className="font-semibold">🛡️ O que sua carteira vai pedir:</p>
              <p className="mt-1">
                Apenas{" "}
                <strong>
                  enviar{" "}
                  {n > 0
                    ? `${n.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} ${sym}`
                    : sym}
                </strong>{" "}
                para a carteira do robô terminada em{" "}
                <span className="font-mono">{botAddress.slice(-6)}</span>.
              </p>
              <p className="mt-1 text-muted-foreground">
                Não pedimos permissão sobre outros tokens, nem "aprovação ilimitada", nem assinatura
                de mensagem. Se a carteira mostrar algo diferente disso, recuse.
              </p>
            </div>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Origem dos ativos:{" "}
              <span className="font-mono">{sourceAddress ?? account ?? "Conecte a carteira"}</span>
            </p>
            {!isBnb && tok && (
              <div className="mt-2 rounded-xl bg-muted p-3 text-xs">
                <p className="break-all">
                  Contrato de {sym}: {tok.address}
                </p>
                <p className="mt-1">
                  A carteira pode mostrar uma interação com este contrato e 0 BNB, pois o envio é de{" "}
                  {sym}. O destinatário dos tokens é a carteira do robô abaixo.
                </p>
                <p className="mt-1">
                  Se o aplicativo avisar risco, cancele o pedido e confira os detalhes. Este resumo
                  não substitui a análise da carteira.
                </p>
              </div>
            )}
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Destino (carteira do robô): <span className="font-mono">{botAddress}</span>
            </p>
            <Button className="mt-2 w-full" disabled={!valid || !!busy} onClick={send}>
              {busy && account
                ? busy
                : valid
                  ? `Enviar ${n} ${sym}${isBnb ? ` (≈ ${brl(n)})` : ""} para o robô`
                  : "Enviar para o robô"}
            </Button>
            {hash && (
              <a
                className="mt-2 block text-xs text-primary underline"
                href={`https://bscscan.com/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
              >
                Acompanhar na BscScan
              </a>
            )}
            {hash && account && (
              <p className="mt-2 text-xs text-muted-foreground">
                Terminou? Você pode{" "}
                <button className="text-primary underline" onClick={disconnect}>
                  desconectar sua carteira
                </button>{" "}
                agora.
              </p>
            )}
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
