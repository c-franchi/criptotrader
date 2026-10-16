import { useRef, useState } from "react";
import { toast } from "sonner";
import { createPublicClient, createWalletClient, custom, formatEther, http, parseEther, type WalletClient } from "viem";
import { bsc } from "viem/chains";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWalletConfig } from "@/lib/wallet.functions";

const pub = () => createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });
const GAS_KEEP = 0.0005; // fica na carteira pessoal para pagar o gás desta transferência

/** Sends BNB from the user's personal wallet (signed in their own app) to the robot wallet. */
export function FundBotDialog({ botAddress, onDone }: { botAddress: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
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

  const max = bal != null ? Math.max(bal - GAS_KEEP, 0) : 0;
  const n = Number(amount.replace(",", "."));
  const valid = n > 0 && n <= max;

  const send = async () => {
    if (!wallet || !account || !valid) return;
    if (account.toLowerCase() === botAddress.toLowerCase()) return void toast.error("Essa já é a carteira do robô");
    setBusy("Confirme no app da sua carteira…");
    try {
      const h = await wallet.sendTransaction({ account: account as `0x${string}`, chain: bsc, to: botAddress as `0x${string}`, value: parseEther(n.toFixed(8)) });
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
            <Input className="mt-2" inputMode="decimal" placeholder="0,01" disabled={!account} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1">
              {[0.01, 0.05, 0.1].map((v) => <Button key={v} size="sm" variant="secondary" disabled={!account || v > max} onClick={() => setAmount(String(v))}>{v}</Button>)}
              <Button size="sm" variant="secondary" disabled={!account || max <= 0} onClick={() => setAmount(max.toFixed(6))}>Máximo</Button>
            </div>
            {account && n > max && <p className="mt-1 text-xs text-destructive">Maior que o saldo disponível ({max.toFixed(6)} BNB, guardando um pouco para o gás).</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">Envie só o que aceita arriscar. Lembre de deixar uma pequena sobra no robô para o gás das operações.</p>
          </li>
          <li className={`rounded-md border p-3 ${valid ? "border-primary/40" : "border-border opacity-60"}`}>
            <p className="font-medium">3. Confirmar</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">Destino (carteira do robô): <span className="font-mono">{botAddress}</span></p>
            <Button className="mt-2 w-full" disabled={!valid || !!busy} onClick={send}>{busy && account ? busy : `Enviar ${valid ? n : ""} BNB para o robô`}</Button>
            {hash && <a className="mt-2 block text-xs text-primary underline" href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">Acompanhar na BscScan</a>}
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
