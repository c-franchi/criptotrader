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
const GAS_KEEP = 0.001; // fica na carteira pessoal para pagar o gás desta transferência
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
  onDone,
  botBnb,
  need,
}: {
  botAddress: string;
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
  const [hash, setHash] = useState<string | null>(null);
  const [unit, setUnit] = useState<"BRL" | "BNB">("BRL");
  const [brlPerBnb, setBrlPerBnb] = useState<number | null>(null);
  const providerRef = useRef<Req | null>(null);
  const tok = asset === "BNB" ? null : (tokens.find((t) => t.address === asset) ?? null);
  const isBnb = !tok;

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
    pub()
      .readContract({
        address: tok.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account as `0x${string}`],
      })
      .then((b) => setTokBal(Number(formatUnits(b, tok.decimals))))
      .catch(() => setTokBal(null));
  }, [account, asset]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy("Conectando…");
    try {
      const provider = await connectWallet();
      providerRef.current = provider as unknown as Req;
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
    await resetWallet();
    providerRef.current = null;
    setAccount(null);
    setBnbBal(null);
    setTokBal(null);
    setAmount("");
    toast.success("Carteira desconectada do CryptoBot");
  };

  const floor6 = (v: number) => Math.floor(v * 1e6) / 1e6;
  const useBrl = isBnb && unit === "BRL";
  const max = isBnb
    ? bnbBal != null
      ? floor6(Math.max(bnbBal - GAS_KEEP, 0))
      : 0
    : tokBal != null
      ? floor6(tokBal)
      : 0;
  const typed = Number(amount.replace(",", "."));
  const n = floor6(useBrl ? (brlPerBnb ? typed / brlPerBnb : 0) : typed);
  const gasOk = isBnb || (bnbBal ?? 0) >= 0.0003;
  const miss = isBnb && need ? missingBnb(need.total, botBnb ?? 0, n) : 0;
  const valid = n > 0 && n <= max && gasOk && miss === 0;
  const pct = max > 0 ? Math.min(100, Math.round((n / max) * 100)) : 0;
  const sym = tok?.symbol ?? "BNB";
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
      // Pedido completo e simples: Trust Wallet recusa ("Unknown method") quando falta "data" ou a rede.
      let tx: { from: string; to: string; value: string; data: `0x${string}` };
      if (isBnb) {
        tx = { from, to: botAddress, value: hex(parseEther(n.toFixed(6))), data: "0x" };
      } else {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [
            botAddress as `0x${string}`,
            parseUnits(n.toFixed(Math.min(6, tok!.decimals)), tok!.decimals),
          ],
        });
        tx = { from, to: tok!.address, value: "0x0", data };
      }
      const [gasPrice, gas] = await Promise.all([
        p.getGasPrice(),
        p
          .estimateGas({
            account: from,
            to: tx.to as `0x${string}`,
            value: BigInt(tx.value),
            data: tx.data,
          })
          .then((g) => (g * 12n) / 10n)
          .catch(() => (isBnb ? 21000n : 100000n)),
      ]);
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
            <select
              className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
              disabled={!account}
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
            >
              <option value="BNB">BNB (para comprar e pagar o gás)</option>
              {tokens.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol} — {t.name}
                </option>
              ))}
            </select>
            {isBnb && (
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
                {(["BRL", "BNB"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => switchUnit(u)}
                    disabled={u === "BRL" && !brlPerBnb}
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
                disabled={!account}
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
                  disabled={!account || max <= 0}
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
              disabled={!account || max <= 0}
              onValueChange={([v]) => setVal((max * (v ?? 0)) / 100)}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Disponível: {max.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {sym}
              {isBnb
                ? ` ≈ ${brl(max)} (guardamos ${GAS_KEEP} BNB na sua carteira para a taxa da rede).`
                : tokBal == null && account
                  ? " (consultando…)"
                  : "."}
            </p>
            {!gasOk && account && (
              <p className="mt-1 text-xs text-destructive">
                Você precisa de um pouco de BNB na sua carteira para pagar a taxa da rede deste
                envio.
              </p>
            )}
            {account && n > max && (
              <p className="mt-1 text-xs text-destructive">Valor maior que o disponível.</p>
            )}
            {account && n > 0 && miss > 0 && need && (
              <div className="mt-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-xs space-y-1">
                <p className="font-semibold">⚠️ Valor não é compatível com a sua estratégia</p>
                <p>
                  Para o robô conseguir fazer uma compra, a carteira dele precisa de{" "}
                  <strong>
                    {need.total.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB
                  </strong>{" "}
                  (≈ {brl(need.total)}):
                </p>
                <p>
                  • {need.trade.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB para a
                  compra ({brl(need.trade)})<br />• {need.reserve} BNB guardados para o gás (
                  {brl(need.reserve)})
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
                  O gás de cada operação custa centavos — a reserva é só uma "poupança" para o robô
                  nunca travar no meio de uma venda. Você pode diminuir essa reserva ou o valor de
                  compra na estratégia.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={n + miss > max}
                    onClick={() => setVal(n + miss)}
                  >
                    Usar valor mínimo
                  </Button>
                  <Button asChild type="button" size="sm" variant="outline">
                    <Link to="/estrategia" onClick={() => setOpen(false)}>
                      Ajustar estratégia
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
