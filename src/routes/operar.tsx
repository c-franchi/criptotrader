import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createPublicClient, createWalletClient, custom, formatEther, formatUnits, http, parseEther, parseUnits, getAddress, type WalletClient } from "viem";
import { bsc } from "viem/chains";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell, Panel, RequireLogin, Unavailable } from "@/components/AppShell";
import { getWalletConfig } from "@/lib/wallet.functions";
import { EMPTY_CONFIG, type StrategyConfig } from "@/lib/strategy";
import { PANCAKE_V2_FACTORY, PANCAKE_V2_ROUTER, WBNB, ZERO, erc20Abi, factoryAbi, minOut, pairAbi, priceImpactPct, routerAbi } from "@/lib/pancake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";
import { TOKENS } from "@/lib/tokens";
import { useSelectedToken } from "@/hooks/useSelectedToken";

export const Route = createFileRoute("/operar")({
  head: () => ({
    meta: [
      { title: "Operar — GTE Monitor" },
      { name: "description", content: "Compre e venda GTE pela PancakeSwap V2 com confirmação na sua carteira via WalletConnect." },
      { property: "og:title", content: "Operar — GTE Monitor" },
      { property: "og:description", content: "Compre e venda GTE pela PancakeSwap V2 com confirmação na sua carteira via WalletConnect." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequireLogin>
        <Operar />
      </RequireLogin>
    </AppShell>
  ),
});

const pub = createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });
type Order = Tables<"orders">;
type Quote = { side: "compra" | "venda"; amountIn: bigint; out: bigint; min: bigint; impact: number };

function Operar() {
  const { user } = useAuth();
  const providerRef = useRef<any>(null);
  const { token: selected, selectToken: setGTE } = useSelectedToken();
  const GTE = selected.address;
  const sym = selected.symbol;
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [tracked, setTracked] = useState<string | null>(null);
  const [cfg, setCfg] = useState<StrategyConfig>(EMPTY_CONFIG);
  const [pair, setPair] = useState<string | null | undefined>(undefined);
  const [reserves, setReserves] = useState<{ bnb: bigint; gte: bigint } | null>(null);
  const [bal, setBal] = useState<{ bnb: bigint; gte: bigint } | null>(null);
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [buyAmt, setBuyAmt] = useState("");
  const [sellAmt, setSellAmt] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50);
    setOrders(data ?? []);
  }, []);

  const loadMarket = useCallback(async () => {
    try {
      const p = await pub.readContract({ address: PANCAKE_V2_FACTORY, abi: factoryAbi, functionName: "getPair", args: [GTE, WBNB] });
      if (p === ZERO) return setPair(null);
      setPair(p);
      const [r0, r1] = await pub.readContract({ address: p, abi: pairAbi, functionName: "getReserves" });
      const t0 = await pub.readContract({ address: p, abi: pairAbi, functionName: "token0" });
      const gteIs0 = t0.toLowerCase() === GTE.toLowerCase();
      setReserves({ gte: gteIs0 ? r0 : r1, bnb: gteIs0 ? r1 : r0 });
      setGasPrice(await pub.getGasPrice());
    } catch {
      setPair(undefined);
      toast.error("Falha ao consultar a PancakeSwap");
    }
  }, [GTE]);

  const loadBalances = useCallback(async (addr: string) => {
    const a = getAddress(addr);
    const [bnb, gte] = await Promise.all([
      pub.getBalance({ address: a }),
      pub.readContract({ address: GTE, abi: erc20Abi, functionName: "balanceOf", args: [a] }),
    ]);
    setBal({ bnb, gte });
  }, [GTE]);

  useEffect(() => {
    supabase.from("strategies").select("tracked_wallet, config").maybeSingle().then(({ data }) => {
      setTracked(data?.tracked_wallet ?? null);
      if (data) setCfg({ ...EMPTY_CONFIG, ...(data.config as Partial<StrategyConfig>) });
    });
    loadOrders();
    loadMarket();
    const t = setInterval(loadMarket, 30_000);
    return () => clearInterval(t);
  }, [loadOrders, loadMarket]);

  useEffect(() => { if (account) loadBalances(account); }, [account, loadBalances]);

  const connect = async () => {
    setBusy("conectando");
    try {
      const { projectId } = await getWalletConfig();
      if (!projectId) throw new Error("Project ID do WalletConnect não configurado");
      const { Buffer } = await import("buffer");
      (globalThis as any).Buffer ??= Buffer;
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const provider = await EthereumProvider.init({
        projectId, chains: [56], showQrModal: true,
        metadata: { name: "GTE Monitor", description: "Monitor GTE", url: window.location.origin, icons: [] },
      });
      provider.on("accountsChanged", (a: string[]) => { setAccount(a[0] ?? null); setQuote(null); toast.warning("Conta alterada na carteira"); });
      provider.on("chainChanged", (c: string) => { setChainId(Number(c)); setQuote(null); });
      provider.on("disconnect", () => { setAccount(null); setWallet(null); });
      await provider.connect();
      providerRef.current = provider;
      setAccount(provider.accounts[0] ?? null);
      setChainId(provider.chainId);
      setWallet(createWalletClient({ chain: bsc, transport: custom(provider) }));
    } catch (e) {
      toast.error((e as Error).message || "Conexão cancelada");
    } finally { setBusy(null); }
  };

  const disconnect = async () => { await providerRef.current?.disconnect(); setAccount(null); setWallet(null); };

  const gasReserve = parseEther(String(cfg.gasReserveBnb || 0));
  const blocks: string[] = [];
  if (!account) blocks.push("Conecte a carteira.");
  if (account && chainId !== 56) blocks.push(`Rede incorreta (chain ${chainId}). Mude para BNB Smart Chain (56).`);
  if (!tracked) blocks.push("Cadastre a carteira acompanhada na página Estratégia.");
  if (account && tracked && account.toLowerCase() !== tracked.toLowerCase()) blocks.push("A carteira conectada não é a carteira cadastrada.");
  if (pair === null) blocks.push(`Aguardando pool ${sym}/WBNB na PancakeSwap V2.`);
  if (pair === undefined) blocks.push("Dados do pool indisponíveis.");
  if (gasPrice && cfg.maxGasGwei && gasPrice > parseUnits(String(cfg.maxGasGwei), 9)) blocks.push("Gas acima do limite configurado.");
  const ready = blocks.length === 0;

  const prepare = async (side: "compra" | "venda") => {
    try {
      if (!reserves || !bal) throw new Error("Dados indisponíveis");
      const amountIn = side === "compra" ? parseEther(buyAmt || "0") : parseUnits(sellAmt || "0", 18);
      if (amountIn <= 0n) throw new Error("Informe um valor maior que zero");
      if (side === "compra" && amountIn + gasReserve > bal.bnb) throw new Error("Saldo de BNB insuficiente considerando a reserva para gas");
      if (side === "venda" && amountIn > bal.gte) throw new Error(`Saldo de ${sym} insuficiente`);
      if (side === "venda" && bal.bnb < gasReserve) throw new Error("BNB insuficiente para gas");
      const path = side === "compra" ? [WBNB, GTE] : [GTE, WBNB];
      const amounts = await pub.readContract({ address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, path] });
      const out = amounts[amounts.length - 1]!;
      const impact = priceImpactPct(amountIn, side === "compra" ? reserves.bnb : reserves.gte);
      if (impact > cfg.maxPriceImpactPct) throw new Error(`Impacto de preço ${impact.toFixed(2)}% acima do limite de ${cfg.maxPriceImpactPct}%`);
      setQuote({ side, amountIn, out, min: minOut(out, cfg.maxSlippagePct), impact });
    } catch (e) { toast.error((e as Error).message); }
  };

  const execute = async () => {
    if (!quote || !wallet || !account || !user || busy) return;
    const acct = getAddress(account);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const path = quote.side === "compra" ? [WBNB, GTE] as const : [GTE, WBNB] as const;
    const { data: order, error } = await supabase.from("orders").insert({
      user_id: user.id, side: quote.side, wallet: acct, pair_address: pair ?? null, token: GTE, amount_in: quote.amountIn.toString(),
      amount_out_min: quote.min.toString(), quoted_out: quote.out.toString(), slippage_pct: cfg.maxSlippagePct, deadline: Number(deadline),
    }).select().single();
    if (error || !order) return void toast.error("Não foi possível registrar a ordem; nada foi enviado.");
    const upd = (patch: Partial<Order>) => supabase.from("orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", order.id);
    setBusy("assinatura");
    try {
      if (quote.side === "venda") {
        const allowance = await pub.readContract({ address: GTE, abi: erc20Abi, functionName: "allowance", args: [acct, PANCAKE_V2_ROUTER] });
        if (allowance < quote.amountIn) {
          toast.info("Aprove na carteira somente a quantidade desta venda");
          const ah = await wallet.writeContract({ account: acct, chain: bsc, address: GTE, abi: erc20Abi, functionName: "approve", args: [PANCAKE_V2_ROUTER, quote.amountIn] });
          await upd({ approve_hash: ah, status: "aprovando" });
          const ar = await pub.waitForTransactionReceipt({ hash: ah });
          if (ar.status !== "success") throw new Error("Aprovação falhou");
        }
      }
      const req = quote.side === "compra"
        ? (await pub.simulateContract({ account: acct, address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens", args: [quote.min, [...path], acct, deadline], value: quote.amountIn })).request
        : (await pub.simulateContract({ account: acct, address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens", args: [quote.amountIn, quote.min, [...path], acct, deadline] })).request;
      const hash = await wallet.writeContract(req as any);
      await upd({ tx_hash: hash, status: "enviada" });
      setBusy("confirmando");
      const r = await pub.waitForTransactionReceipt({ hash, confirmations: 3 });
      await upd({ status: r.status === "success" ? "confirmada" : "falhou", block_number: Number(r.blockNumber) });
      r.status === "success" ? toast.success("Transação confirmada na blockchain") : toast.error("Transação revertida");
    } catch (e) {
      const msg = (e as Error).message?.split("\n")[0] ?? "erro";
      await upd({ status: "falhou", error: msg.slice(0, 300) });
      toast.error(msg);
    } finally {
      setBusy(null); setQuote(null); loadOrders(); loadBalances(account);
    }
  };

  const fmtGte = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  const fmtBnb = (v: bigint) => Number(formatEther(v)).toLocaleString("pt-BR", { maximumFractionDigits: 6 });

  return (
    <div className="space-y-4">
      <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <strong>Modo CONFIRMAÇÃO — operações reais.</strong> Cada transação precisa ser assinada por você na carteira. Gatilhos e cotações não garantem preço, lucro ou capacidade de venda.
      </div>

      <div className="flex flex-wrap gap-2">
        {TOKENS.map((t) => (
          <Button key={t.address} size="sm" variant={t.address === GTE ? "default" : "secondary"} disabled={!!busy} onClick={() => { setGTE(t.address); setQuote(null); setPair(undefined); setReserves(null); setBal(null); }}>{t.symbol} — {t.name}</Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Carteira" right={account ? <Button size="sm" variant="ghost" onClick={disconnect}>Desconectar</Button> : null}>
          {account ? (
            <div className="space-y-1 text-sm">
              <p className="break-all font-mono text-xs">{account}</p>
              <p>Rede: {chainId === 56 ? <span className="text-success">BNB Smart Chain (56)</span> : <span className="text-destructive">chain {chainId}</span>}</p>
              <p>BNB: {bal ? <span className="font-mono">{fmtBnb(bal.bnb)}</span> : <Unavailable reason="carregando" />}</p>
              <p>{sym}: {bal ? <span className="font-mono">{fmtGte(bal.gte)}</span> : <Unavailable reason="carregando" />}</p>
            </div>
          ) : (
            <Button onClick={connect} disabled={!!busy}>{busy === "conectando" ? "Conectando…" : "Conectar via WalletConnect"}</Button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Cadastrada: <span className="font-mono">{tracked ?? "nenhuma"}</span></p>
        </Panel>

        <Panel title="Rota PancakeSwap V2">
          <div className="space-y-1 text-sm">
            <p>Pool {sym}/WBNB: {pair ? <span className="break-all font-mono text-xs">{pair}</span> : <Unavailable reason={pair === null ? "pool não existe" : "falha de consulta"} />}</p>
            <p>Reserva: {reserves ? <span className="font-mono">{fmtBnb(reserves.bnb)} WBNB / {fmtGte(reserves.gte)} {sym}</span> : <Unavailable reason="sem pool" />}</p>
            <p>Gas: {gasPrice ? <span className="font-mono">{formatUnits(gasPrice, 9)} gwei</span> : <Unavailable reason="sem dados" />}</p>
            <p className="text-xs text-muted-foreground">Router oficial {PANCAKE_V2_ROUTER}. Limites da estratégia: slippage {cfg.maxSlippagePct}%, impacto {cfg.maxPriceImpactPct}%, reserva {cfg.gasReserveBnb} BNB.</p>
          </div>
        </Panel>
      </div>

      {!ready && (
        <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Operações bloqueadas: {blocks.join(" ")}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={`Comprar ${sym} com BNB`}>
          <Label>Valor em BNB</Label>
          <div className="mt-1 flex gap-2">
            <Input type="number" step="any" value={buyAmt} onChange={(e) => { setBuyAmt(e.target.value); setQuote(null); }} />
            <Button onClick={() => prepare("compra")} disabled={!ready || !!busy}>Cotar</Button>
          </div>
        </Panel>
        <Panel title={`Vender ${sym} por BNB`}>
          <Label>Quantidade de {sym}</Label>
          <div className="mt-1 flex gap-2">
            <Input type="number" step="any" value={sellAmt} onChange={(e) => { setSellAmt(e.target.value); setQuote(null); }} />
            <Button variant="secondary" onClick={() => prepare("venda")} disabled={!ready || !!busy}>Cotar</Button>
          </div>
        </Panel>
      </div>

      {quote && (
        <Panel title="Revisar antes de assinar">
          <ul className="space-y-1 text-sm">
            <li>{quote.side === "compra" ? `Enviar ${fmtBnb(quote.amountIn)} BNB` : `Enviar ${fmtGte(quote.amountIn)} ${sym}`}</li>
            <li>Cotação atual: {quote.side === "compra" ? `${fmtGte(quote.out)} ${sym}` : `${fmtBnb(quote.out)} BNB`}</li>
            <li>Mínimo aceito (slippage {cfg.maxSlippagePct}%): {quote.side === "compra" ? `${fmtGte(quote.min)} ${sym}` : `${fmtBnb(quote.min)} BNB`}</li>
            <li>Impacto de preço estimado: {quote.impact.toFixed(2)}%</li>
            <li>Validade: 5 minutos. {quote.side === "venda" && "Pode exigir uma aprovação limitada a esta quantidade."}</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <Button onClick={execute} disabled={!ready || !!busy}>
              {busy === "assinatura" ? "Aguardando assinatura…" : busy === "confirmando" ? "Confirmando…" : "Assinar na carteira"}
            </Button>
            <Button variant="ghost" onClick={() => setQuote(null)} disabled={!!busy}>Cancelar</Button>
          </div>
        </Panel>
      )}

      <Panel title="Ordens reais">
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ordem.</p> : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded border border-border p-2 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className={o.side === "compra" ? "text-success" : "text-destructive"}>{o.side}</span>
                  <span className="font-mono">{o.status}</span>
                  <span className="text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {o.tx_hash && <a className="break-all font-mono text-primary underline" href={`https://bscscan.com/tx/${o.tx_hash}`} target="_blank" rel="noreferrer">{o.tx_hash}</a>}
                {o.error && <p className="text-destructive">{o.error}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Transações já enviadas podem continuar mesmo se você sair. Aprovações existentes precisam ser revogadas separadamente (ex.: revoke.cash).</p>
      </Panel>
    </div>
  );
}
