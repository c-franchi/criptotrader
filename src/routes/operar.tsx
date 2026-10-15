import { createFileRoute, Link } from "@tanstack/react-router";
import { PRESETS } from "@/lib/presets";
import { computePnl, rebuyEdgePct, type Fill } from "@/lib/pnl";
import { cn } from "@/lib/utils";
import { TokenChart } from "@/components/TokenChart";
import { Slider } from "@/components/ui/slider";
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
import { AddTokenDialog } from "@/components/AddTokenDialog";
import { useSelectedToken } from "@/hooks/useSelectedToken";

export const Route = createFileRoute("/operar")({
  validateSearch: (s: Record<string, unknown>): { entrada?: string } =>
    typeof s["entrada"] === "string" && /^\d+(\.\d+)?$/.test(s["entrada"]) ? { entrada: s["entrada"] } : {},
  head: () => ({
    meta: [
      { title: "Operar — CryptoBot" },
      { name: "description", content: "Compre e venda GTE pela PancakeSwap V2 com confirmação na sua carteira via WalletConnect." },
      { property: "og:title", content: "Operar — CryptoBot" },
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
type Quote = { side: "compra" | "venda"; amountIn: bigint; out: bigint; min: bigint; impact: number; tax: number | null };

function friendlyError(m: string): string {
  if (/INSUFFICIENT_OUTPUT_AMOUNT/.test(m)) return "O valor recebido ficaria abaixo do mínimo aceito (o token pode cobrar taxa ou o preço mudou). Nada foi trocado. Cote de novo.";
  if (/rejected|denied/i.test(m)) return "Você recusou a assinatura na carteira. Nada foi enviado.";
  if (/insufficient funds/i.test(m)) return "BNB insuficiente para pagar o gás.";
  if (/TRANSFER_FAILED|TransferHelper/.test(m)) return "O token bloqueou a transferência (pode ter limite ou restrição de venda).";
  if (/EXPIRED/.test(m)) return "A cotação expirou. Cote de novo.";
  return m.split("\n")[0] || "Erro desconhecido";
}

function Operar() {
  const { user } = useAuth();
  const providerRef = useRef<any>(null);
  const { token: selected, selectToken: setGTE, tokens } = useSelectedToken();
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
  const [side, setSide] = useState<"compra" | "venda">("compra");
  const [hasStrategy, setHasStrategy] = useState(false);
  const { entrada } = Route.useSearch();
  const preset = PRESETS.find((p) => p.id === cfg.presetId) ?? null;

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
    supabase.from("strategies").select("tracked_wallet, config, token").order("updated_at", { ascending: false }).then(({ data }) => {
      const rows = data ?? [];
      setTracked(rows.find((r) => r.tracked_wallet)?.tracked_wallet ?? null);
      const own = rows.find((r) => r.token.toLowerCase() === GTE.toLowerCase());
      const next = own ? { ...EMPTY_CONFIG, ...(own.config as Partial<StrategyConfig>) } : EMPTY_CONFIG;
      setHasStrategy(!!own);
      setCfg(next);
      const suggested = entrada ?? (next.sizingMode === "fixo" && next.buyAmount > 0 ? String(next.buyAmount) : "");
      setBuyAmt((cur) => cur || suggested);
    });
    loadOrders();
    loadMarket();
    const t = setInterval(loadMarket, 30_000);
    return () => clearInterval(t);
  }, [loadOrders, loadMarket, GTE]);

  useEffect(() => {
    if (!account) return;
    loadBalances(account);
    const t = setInterval(() => loadBalances(account), 30_000);
    return () => clearInterval(t);
  }, [account, loadBalances]);

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
        metadata: { name: "CryptoBot", description: "Monitor GTE", url: window.location.origin, icons: [] },
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
  const spendable = bal && bal.bnb > gasReserve ? bal.bnb - gasReserve : 0n;
  const maxIn = side === "compra" ? spendable : (bal?.gte ?? 0n);
  const curIn = (() => { try { return side === "compra" ? parseEther(buyAmt || "0") : parseUnits(sellAmt || "0", selected.decimals); } catch { return 0n; } })();
  const pctNow = maxIn > 0n ? Math.min(100, Number((curIn * 10000n) / maxIn) / 100) : 0;
  const applyPct = (p: number) => {
    const v = (maxIn * BigInt(Math.round(p * 100))) / 10000n;
    if (side === "compra") setBuyAmt(v > 0n ? formatEther(v) : "");
    else setSellAmt(v > 0n ? formatUnits(v, selected.decimals) : "");
    setQuote(null);
  };
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
      const amountIn = side === "compra" ? parseEther(buyAmt || "0") : parseUnits(sellAmt || "0", selected.decimals);
      if (amountIn <= 0n) throw new Error("Informe um valor maior que zero");
      if (side === "compra" && amountIn + gasReserve > bal.bnb) throw new Error("Saldo de BNB insuficiente considerando a reserva para gas");
      if (side === "venda" && amountIn > bal.gte) throw new Error(`Saldo de ${sym} insuficiente`);
      if (side === "venda" && bal.bnb < gasReserve) throw new Error("BNB insuficiente para gas");
      const path = side === "compra" ? [WBNB, GTE] : [GTE, WBNB];
      const amounts = await pub.readContract({ address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, path] });
      const out = amounts[amounts.length - 1]!;
      const impact = priceImpactPct(amountIn, side === "compra" ? reserves.bnb : reserves.gte);
      if (impact > cfg.maxPriceImpactPct) throw new Error(`Impacto de preço ${impact.toFixed(2)}% acima do limite de ${cfg.maxPriceImpactPct}%`);
      let q: Quote = { side, amountIn, out, min: minOut(out, cfg.maxSlippagePct), impact, tax: null };
      // Measure the real payout (catches token taxes). Sales can only be measured once approved.
      if (account) {
        const acct = getAddress(account);
        const canMeasure = side === "compra" || (await pub.readContract({ address: GTE, abi: erc20Abi, functionName: "allowance", args: [acct, PANCAKE_V2_ROUTER] })) >= amountIn;
        if (canMeasure) q = withTax(q, await measureReal(side, amountIn, acct, out));
      }
      setQuote(q);
    } catch (e) { toast.error(friendlyError((e as Error).message)); }
  };

  const withTax = (q: Quote, real: bigint): Quote => {
    const tax = q.out > 0n ? Math.max(0, Number(((q.out - real) * 10000n) / q.out) / 100) : 0;
    return { ...q, out: real, min: minOut(real, cfg.maxSlippagePct), tax };
  };

  /** Binary-searches the largest minimum output the router accepts right now = what the swap really pays. */
  const measureReal = async (side: "compra" | "venda", amountIn: bigint, acct: `0x${string}`, quoted: bigint) => {
    const dl = BigInt(Math.floor(Date.now() / 1000) + 300);
    const ok = async (min: bigint) => {
      try {
        if (side === "compra") await pub.simulateContract({ account: acct, address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens", args: [min, [WBNB, GTE], acct, dl], value: amountIn });
        else await pub.simulateContract({ account: acct, address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens", args: [amountIn, min, [GTE, WBNB], acct, dl] });
        return true;
      } catch { return false; }
    };
    if (await ok(quoted)) return quoted;
    let lo = 0n, hi = quoted;
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2n; if (await ok(m)) lo = m; else hi = m; }
    return lo;
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
      if (quote.side === "venda" && quote.tax == null) {
        // Approval is in place now: measure what the swap really pays (token taxes).
        const real = await measureReal("venda", quote.amountIn, acct, quote.out);
        const taxed = withTax(quote, real);
        if (taxed.min < quote.min) {
          await upd({ status: "cancelada", error: `Token cobra ~${taxed.tax!.toFixed(1)}% na venda; cotação refeita antes de enviar.` });
          setQuote(taxed);
          toast.warning(`O ${sym} cobra uma taxa de ~${taxed.tax!.toFixed(1)}% na venda. Nada foi vendido. Revise o novo valor e assine de novo.`);
          setBusy(null); loadOrders();
          return;
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
      const msg = friendlyError((e as Error).message ?? "");
      await upd({ status: "falhou", error: msg.slice(0, 300) });
      toast.error(msg);
    } finally {
      setBusy(null); setQuote(null); loadOrders(); loadBalances(account);
    }
  };

  const fmtGte = (v: bigint) => Number(formatUnits(v, selected.decimals)).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  const fmtBnb = (v: bigint) => Number(formatEther(v)).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
  const n6 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
  const n2 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const fills: Fill[] = orders
    .filter((o) => o.status === "confirmada" && o.token.toLowerCase() === GTE.toLowerCase())
    .map((o) => o.side === "compra"
      ? { side: "compra" as const, bnb: Number(formatEther(BigInt(o.amount_in))), tokens: Number(formatUnits(BigInt(o.quoted_out), selected.decimals)), at: o.created_at }
      : { side: "venda" as const, tokens: Number(formatUnits(BigInt(o.amount_in), selected.decimals)), bnb: Number(formatEther(BigInt(o.quoted_out))), at: o.created_at });
  const pnl = computePnl(fills);
  // tokens per BNB at the current pool price (raw reserve ratio, decimals adjusted)
  const spot = reserves && reserves.bnb > 0n ? Number(formatUnits(reserves.gte, selected.decimals)) / Number(formatEther(reserves.bnb)) : null;
  const total = spot ? pnl.bnbReceived + pnl.position / spot - pnl.bnbSpent : pnl.position === 0 ? pnl.bnbReceived - pnl.bnbSpent : null;
  const status = total == null ? null : total > 1e-9 ? "pos" : total < -1e-9 ? "neg" : "zero";

  return (
    <div className="space-y-4">
      <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <strong>Modo CONFIRMAÇÃO — operações reais.</strong> Cada transação precisa ser assinada por você na carteira. Gatilhos e cotações não garantem preço, lucro ou capacidade de venda.
      </div>

      <div className="flex flex-wrap gap-2">
        {tokens.map((t) => (
          <Button key={t.address} size="sm" variant={t.address === GTE ? "default" : "secondary"} disabled={!!busy} onClick={() => { setGTE(t.address); setQuote(null); setPair(undefined); setReserves(null); setBal(null); }}>{t.symbol} — {t.name}</Button>
        ))}
        <AddTokenDialog wallet={account} />
      </div>

      <TokenChart address={GTE} symbol={sym} />
      {bal && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <span className="font-semibold">Seu saldo</span>
          <span className="text-right font-mono text-sm">{fmtGte(bal.gte)} {sym}<br /><span className="text-muted-foreground">{fmtBnb(bal.bnb)} BNB</span></span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Carteira" right={account ? <Button size="sm" variant="ghost" onClick={disconnect}>Desconectar</Button> : null}>
          {account ? (
            <div className="space-y-1 text-sm">
              <p className="break-all font-mono text-xs">{account}</p>
              <p>Rede: {chainId === 56 ? <span className="text-success">BNB Smart Chain (56)</span> : <span className="text-destructive">chain {chainId}</span>}</p>
              <p>BNB: {bal ? <span className="font-mono">{fmtBnb(bal.bnb)}</span> : <Unavailable reason="carregando" />}</p>
              <p>{sym}: {bal ? <span className="font-mono">{fmtGte(bal.gte)}</span> : <Unavailable reason="carregando" />}</p>
              {bal && gasPrice && (
                <p className={bal.bnb < gasReserve ? "text-destructive" : "text-muted-foreground"}>
                  Gás estimado por transação: ~{fmtBnb(gasPrice * 21000n)} BNB
                  {bal.bnb < gasReserve ? " — BNB insuficiente para a reserva de gás" : bal.bnb < gasPrice * 21000n * 5n ? " — saldo de BNB baixo para várias transações" : ""}
                </p>
              )}
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

      <div className={hasStrategy ? "rounded border border-primary/60 bg-primary/10 p-3 text-sm" : "rounded border border-border p-3 text-sm"}>
        {hasStrategy ? (
          <>
            <p><strong>✓ Estratégia em uso para {sym}:</strong> {preset ? preset.name : "personalizada"}</p>
            <p className="text-xs text-muted-foreground">
              {cfg.sizingMode === "fixo" && cfg.buyAmount > 0 ? `Primeira entrada sugerida: ${cfg.buyAmount} BNB. ` : ""}
              Slippage máx. {cfg.maxSlippagePct}%, impacto máx. {cfg.maxPriceImpactPct}%, reserva de gás {cfg.gasReserveBnb} BNB — já aplicados aqui.
            </p>
          </>
        ) : (
          <p>Nenhuma estratégia salva para {sym}. <Link to="/estrategia" className="text-primary underline">Criar estratégia</Link> (opcional).</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button className={side === "compra" ? "bg-success text-background hover:bg-success/90" : ""} variant={side === "compra" ? "default" : "secondary"} onClick={() => { setSide("compra"); setQuote(null); }}>Comprar</Button>
          <Button variant={side === "venda" ? "destructive" : "secondary"} onClick={() => { setSide("venda"); setQuote(null); }}>Vender</Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {side === "compra" ? <>Você paga <b>BNB</b> e recebe <b>{sym}</b>.</> : <>Você entrega <b>{sym}</b> e recebe <b>BNB</b>.</>}
        </p>
        <Label className="mt-3 block">{side === "compra" ? "Quanto BNB usar" : `Quantidade de ${sym}`}</Label>
        <Input className="mt-1" type="number" step="any" value={side === "compra" ? buyAmt : sellAmt}
          onChange={(e) => { (side === "compra" ? setBuyAmt : setSellAmt)(e.target.value); setQuote(null); }} />
        <p className="mt-1 text-xs text-muted-foreground">
          Disponível: {bal ? (side === "compra" ? `${fmtBnb(spendable)} BNB (já descontada a reserva de gás)` : `${fmtGte(bal.gte)} ${sym}`) : "conecte a carteira"}
        </p>
        <Slider className="mt-4" min={0} max={100} step={1} value={[pctNow]} disabled={!bal} onValueChange={([v]) => applyPct(v ?? 0)} />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[25, 50, 75, 100].map((p) => (
            <Button key={p} size="sm" variant={Math.round(pctNow) === p ? "default" : "outline"} disabled={!bal} onClick={() => applyPct(p)}>{p === 100 ? "Máx" : `${p}%`}</Button>
          ))}
        </div>
        <Button className="mt-4 w-full" size="lg" variant={side === "venda" ? "destructive" : "default"} onClick={() => prepare(side)} disabled={!ready || !!busy}>
          {side === "compra" ? `Cotar compra de ${sym}` : `Cotar venda de ${sym}`}
        </Button>
      </div>

      {quote && (
        <Panel title="Revisar antes de assinar">
          {(() => {
            const hasTax = quote.tax != null && quote.tax > 0.5;
            const gross = hasTax ? (quote.out * 10000n) / BigInt(Math.round((100 - quote.tax!) * 100)) : null;
            const envia = quote.side === "compra" ? `${fmtBnb(quote.amountIn)} BNB` : `${fmtGte(quote.amountIn)} ${sym}`;
            const recebe = quote.side === "compra" ? `${fmtGte(quote.out)} ${sym}` : `${fmtBnb(quote.out)} BNB`;
            const bruto = gross == null ? null : quote.side === "compra" ? `${fmtGte(gross)} ${sym}` : `${fmtBnb(gross)} BNB`;
            const bnbIn = Number(formatEther(quote.amountIn));
            const tkOut = Number(formatUnits(quote.out, selected.decimals));
            return (
              <div className="rounded-lg border border-primary/60 bg-primary/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Você envia</p>
                <p className="font-mono text-2xl font-bold">{envia}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {quote.side === "compra" ? `Você recebe — ${sym}, taxa do token já descontada` : quote.tax == null ? "Você recebe — BNB (taxa será medida depois da aprovação)" : "Você recebe — BNB, taxa do token já descontada"}
                </p>
                <p className="font-mono text-2xl font-bold text-success">{recebe}</p>
                {quote.side === "compra" && quote.out > 0n && bnbIn > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Câmbio desta troca: 1 BNB ≈ {n2(tkOut / bnbIn)} {sym} (taxa incluída).</p>
                ) : null}
                {quote.side === "venda" && quote.amountIn > 0n && tkOut > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Câmbio desta troca: 1 {sym} ≈ {n6(bnbIn / tkOut)} BNB (taxa incluída).</p>
                ) : null}
                {bruto != null ? (
                  <p className="mt-2 text-sm text-warning">Sem a taxa de ~{quote.tax!.toFixed(1)}%, seriam {bruto} — a diferença fica com o token.</p>
                ) : quote.tax != null && quote.tax <= 0.5 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Taxa do token: nenhuma detectada nesta troca.</p>
                ) : null}
              </div>
            );
          })()}
          <ul className="mt-3 space-y-1 text-sm">
            {quote.side === "compra" && pnl.lastSell && (() => {
              const bnbIn = Number(formatEther(quote.amountIn)), tk = Number(formatUnits(quote.out, selected.decimals));
              const edge = rebuyEdgePct(pnl.lastSell, bnbIn, tk);
              const atSellRate = bnbIn * (pnl.lastSell.tokens / pnl.lastSell.bnb);
              return edge == null ? null : (
                <li className={edge >= 0 ? "text-success" : "text-destructive"}>
                  Na última venda, {n6(bnbIn)} BNB valiam {n2(atSellRate)} {sym}. Agora você compra {n2(tk)} {sym}: {edge >= 0 ? "+" : ""}{edge.toFixed(1)}% {edge >= 0 ? "a mais" : "a menos"}.
                </li>
              );
            })()}
            {quote.side === "venda" && pnl.avgCost && (() => {
              const tk = Number(formatUnits(quote.amountIn, selected.decimals)), bnb = Number(formatEther(quote.out));
              const res = bnb - tk * pnl.avgCost;
              return <li className={res >= 0 ? "text-success" : "text-destructive"}>Pelo seu preço médio, esta venda dá {res >= 0 ? "lucro" : "prejuízo"} de ~{n6(Math.abs(res))} BNB.</li>;
            })()}
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

      <Panel title={`Seus resultados com ${sym}`}>
        {pnl.buys + pnl.sells === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma troca confirmada de {sym} ainda. Depois da primeira compra ou venda, o resultado aparece aqui.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className={cn("rounded border p-3", status === "pos" ? "border-success/50 bg-success/10" : status === "neg" ? "border-destructive/50 bg-destructive/10" : "border-border")}>
              <p className="text-xs text-muted-foreground">Situação geral (vendido + valor atual do que sobrou − gasto)</p>
              <p className={cn("text-2xl font-bold", status === "pos" ? "text-success" : status === "neg" ? "text-destructive" : "")}>
                {total == null ? "—" : `${total >= 0 ? "+" : ""}${total.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BNB`}
                {total != null && pnl.bnbSpent > 0 ? <span className="ml-2 text-base">({((total / pnl.bnbSpent) * 100).toFixed(1)}%)</span> : null}
              </p>
              <p>{status === "pos" ? "Você está positivo." : status === "neg" ? "Você está negativo." : total == null ? "Sem preço atual para calcular." : "Empatado."}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <p>Compras: <b>{pnl.buys}</b> · gasto {n6(pnl.bnbSpent)} BNB</p>
              <p>Vendas: <b>{pnl.sells}</b> · recebido {n6(pnl.bnbReceived)} BNB</p>
              <p>Lucro/prejuízo já realizado: <b className={pnl.realized >= 0 ? "text-success" : "text-destructive"}>{pnl.realized >= 0 ? "+" : ""}{n6(pnl.realized)} BNB</b></p>
              <p>Ainda com você (destas compras): <b>{n2(pnl.position)} {sym}</b>{pnl.avgCost ? <> · preço médio {pnl.avgCost.toPrecision(4)} BNB</> : null}</p>
            </div>
            {pnl.lastSell && (
              <p className="rounded border border-border p-2 text-xs">
                <b>Última venda:</b> {n2(pnl.lastSell.tokens)} {sym} → {n6(pnl.lastSell.bnb)} BNB
                (1 BNB = {n2(pnl.lastSell.tokens / pnl.lastSell.bnb)} {sym}).
                {spot ? <> Agora 1 BNB compra ~{n2(spot)} {sym}: <b className={spot >= pnl.lastSell.tokens / pnl.lastSell.bnb ? "text-success" : "text-destructive"}>{spot >= pnl.lastSell.tokens / pnl.lastSell.bnb ? "mais" : "menos"} tokens</b> do que você vendeu.</> : null}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Valores em BNB pela cotação de cada troca (com taxa do token), sem o gás. Tokens que já estavam na carteira antes não entram no lucro.</p>
          </div>
        )}
      </Panel>

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
