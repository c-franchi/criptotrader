import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { getFxQuote } from "@/lib/fx.functions";
import { toast } from "sonner";
import { createPublicClient, createWalletClient, custom, formatEther, http, parseEther, type WalletClient } from "viem";
import { bsc } from "viem/chains";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWalletConfig } from "@/lib/wallet.functions";

const pub = () => createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });
const GAS_KEEP = 0.001; // fica na carteira pessoal para pagar o gás desta transferência

/** Sends BNB from the user's personal wallet (signed in their own app) to the robot wallet. */
export function FundBotDialog({ botAddress, onDone }: { botAddress: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [unit, setUnit] = useState<"BRL" | "BNB">("BRL");
  const [brlPerBnb, setBrlPerBnb] = useState<number | null>(null);
  useEffect(() => { if (open) getFxQuote().then((q) => setBrlPerBnb(q.bnbUsd && q.usdBrl ? q.bnbUsd * q.usdBrl : null)).catch(() => {}); }, [open]);
  const providerRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

  const connect = async () => {
    setBusy("Conectando…");
    try {
      const { projectId } = await getWalletConfig();
      if (!projectId) throw new Error("Conexão de carteira não configurada");
      const { Buffer } = await import("buffer");
      (globalThis as any).Buffer ??= Buffer;
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const provider = await EthereumProvider.init({
        projectId, chains: [56], showQrModal: true,
        metadata: { name: "CryptoBot", description: "Abastecer robô", url: window.location.origin, icons: [] },
      });
      await provider.connect();
      providerRef.current = provider;
      const a = provider.accounts[0] ?? null;
      setAccount(a);
      setWallet(createWalletClient({ chain: bsc, transport: custom(provider) }));
      if (a) setBal(Number(formatEther(await pub().getBalance({ address: a as `0x${string}` }))));
    } catch (e) {
      toast.error((e as Error).message || "Conexão cancelada");
    } finally { setBusy(null); }
  };

  // Arredonda para baixo, para nunca passar do saldo.
  const floor6 = (v: number) => Math.floor(v * 1e6) / 1e6;
  const max = bal != null ? floor6(Math.max(bal - GAS_KEEP, 0)) : 0;
  const typed = Number(amount.replace(",", "."));
  const n = floor6(unit === "BRL" ? (brlPerBnb ? typed / brlPerBnb : 0) : typed);
  const valid = n > 0 && n <= max;
  const pct = max > 0 ? Math.min(100, Math.round((n / max) * 100)) : 0;
  const brl = (bnb: number) => brlPerBnb ? (bnb * brlPerBnb).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  const setBnb = (bnb: number) => {
    const v = floor6(bnb);
    setAmount(unit === "BRL" && brlPerBnb ? (v * brlPerBnb).toFixed(2) : String(v));
  };
  const switchUnit = (u: "BRL" | "BNB") => {
    if (u === unit) return;
    setUnit(u);
    if (n > 0) setAmount(u === "BRL" && brlPerBnb ? (n * brlPerBnb).toFixed(2) : String(n));
  };

  const send = async () => {
    if (!wallet || !account || !valid) return;
    if (account.toLowerCase() === botAddress.toLowerCase()) return void toast.error("Essa já é a carteira do robô");
    setBusy("Confirme no app da sua carteira…");
    try {
      const h = await wallet.sendTransaction({ account: account as `0x${string}`, chain: bsc, to: botAddress as `0x${string}`, value: parseEther(n.toFixed(6)) });
      setHash(h);
      setBusy("Aguardando a rede confirmar…");
      const r = await pub().waitForTransactionReceipt({ hash: h, timeout: 90_000 });
      if (r.status !== "success") throw new Error("A rede recusou a transferência");
      toast.success(`${n} BNB enviados para o robô`);
      onDone?.();
    } catch (e) {
      toast.error(((e as Error).message || "Transferência cancelada").split("\n")[0]!);
    } finally { setBusy(null); }
  };

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) { void providerRef.current?.disconnect().catch(() => {}); setAccount(null); setWallet(null); setBal(null); setAmount(""); setHash(null); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild><Button size="sm">Enviar BNB da minha carteira</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abastecer o robô</DialogTitle>
          <DialogDescription>Você envia BNB da sua carteira para a carteira do robô. Quem confirma é você, no app da sua carteira — o CryptoBot nunca pede sua senha ou frase secreta.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li className={`rounded-md border p-3 ${account ? "border-success/40 bg-success/5" : "border-primary/40"}`}>
            <p className="font-medium">1. Conectar sua carteira</p>
            {account ? (
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{account}<br />Saldo: {bal != null ? `${bal.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB` : "—"}</p>
            ) : <Button className="mt-2" size="sm" disabled={!!busy} onClick={connect}>{busy ?? "Conectar carteira"}</Button>}
          </li>
          <li className={`rounded-md border p-3 ${account ? "border-primary/40" : "border-border opacity-60"}`}>
            <p className="font-medium">2. Quanto enviar?</p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
              {(["BRL", "BNB"] as const).map((u) => (
                <button key={u} type="button" onClick={() => switchUnit(u)} disabled={u === "BRL" && !brlPerBnb}
                  className={`rounded px-2 py-1 text-xs font-semibold ${unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {u === "BRL" ? "Em reais (R$)" : "Em BNB"}
                </button>
              ))}
            </div>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{unit === "BRL" ? "R$" : "BNB"}</span>
              <Input className="pl-12 text-base" inputMode="decimal" placeholder={unit === "BRL" ? "100,00" : "0,01"} disabled={!account} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {n > 0 && <p className="mt-1 text-sm">= <strong className="font-mono text-primary">{n.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB</strong> <span className="text-muted-foreground">≈ {brl(n)}</span></p>}
            {unit === "BRL" && (
              <div className="mt-2 grid grid-cols-4 gap-1">
                {[25, 50, 100, 200].map((v) => <Button key={v} type="button" size="sm" variant="secondary" disabled={!account || !brlPerBnb || v / brlPerBnb > max} onClick={() => setAmount(v.toFixed(2))}>R$ {v}</Button>)}
              </div>
            )}
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((p) => <Button key={p} type="button" size="sm" variant={pct === p ? "default" : "outline"} disabled={!account || max <= 0} onClick={() => setBnb((max * p) / 100)}>{p === 100 ? "Máx" : `${p}%`}</Button>)}
            </div>
            <Slider className="mt-4" min={0} max={100} step={1} value={[pct]} disabled={!account || max <= 0} onValueChange={([v]) => setBnb((max * (v ?? 0)) / 100)} />
            <p className="mt-2 text-[11px] text-muted-foreground">Disponível para enviar: {max.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB ≈ {brl(max)} (guardamos {GAS_KEEP} BNB na sua carteira para a taxa da rede).</p>
            {account && n > max && <p className="mt-1 text-xs text-destructive">Valor maior que o disponível.</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">Envie só o que aceita arriscar. Lembre de deixar uma pequena sobra no robô para o gás das operações.</p>
          </li>
          <li className={`rounded-md border p-3 ${valid ? "border-primary/40" : "border-border opacity-60"}`}>
            <p className="font-medium">3. Confirmar</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">Destino (carteira do robô): <span className="font-mono">{botAddress}</span></p>
            <Button className="mt-2 w-full" disabled={!valid || !!busy} onClick={send}>{busy && account ? busy : valid ? `Enviar ${n} BNB (≈ ${brl(n)}) para o robô` : "Enviar para o robô"}</Button>
            {hash && <a className="mt-2 block text-xs text-primary underline" href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">Acompanhar na BscScan</a>}
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
