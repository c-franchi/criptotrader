import { formatEther, formatUnits, getAddress, parseEther, parseUnits } from "viem";
import { PANCAKE_V2_ROUTER, WBNB, erc20Abi, priceImpactPct } from "./pancake";
import { botSigner, poolState, pubClient, sendSwap } from "./bot.server";
import { tokenMeta } from "./tokenMeta.server";
import { readMarket } from "./market.server";
import { readCandles } from "./history.server";
import { afterTrade, closesAt, decide, intervalMinutes, normalizeState } from "./autoStrategy";
import { taxFor } from "./tokens";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";

type Bot = { id: string; user_id: string; token: string; strat_state: unknown };

/** Runs one tick of the robot following the user's saved strategy for this token. At most one swap. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runStrategyStep(admin: any, bot: Bot, enc: string) {
  const now = Date.now();
  const { data: strat } = await admin.from("strategies").select("config").eq("user_id", bot.user_id).ilike("token", bot.token).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!strat) return { patch: { last_error: "Nenhuma estratégia salva para este token", last_reason: null }, order: null };
  const cfg: StrategyConfig = { ...EMPTY_CONFIG, ...(strat.config as Partial<StrategyConfig>) };
  const state = normalizeState(bot.strat_state, now);
  const token = getAddress(bot.token);
  const rpc = process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org";

  const market = await readMarket(token, rpc);
  const best = market.pools.find((p) => p.supported && p.priceUsd);
  const priceUsd = Number(best?.priceUsd);
  if (!best || !(priceUsd > 0)) return { patch: { last_error: null, last_reason: "Preço indisponível — aguardando", strat_state: state }, order: null };
  let candles: Awaited<ReturnType<typeof readCandles>> = [];
  try { candles = await readCandles(best.pairAddress.toLowerCase(), token.toLowerCase()); } catch { /* history unavailable */ }
  const since = now / 1000 - cfg.windowHours * 3600;
  const recent = candles.filter((c) => c[0] >= since);
  const high = recent.length ? Math.max(...recent.map((c) => c[2])) : null;
  const closes = closesAt(candles, intervalMinutes(cfg.candleInterval), now);
  if (state.tokens > 0) state.peakUsd = Math.max(state.peakUsd, priceUsd);

  const d = decide(cfg, state, { priceUsd, liquidityUsd: best.liquidityUsd, high, closes, now });
  const patch: Record<string, unknown> = { last_price: priceUsd, last_error: null, last_reason: d.reason, strat_state: state };
  if (d.action === "nenhuma") return { patch, order: null };

  const pool = await poolState(token);
  if (!pool) return { patch: { ...patch, last_error: "Pool inexistente" }, order: null };
  const pub = pubClient();
  const { account, wallet } = await botSigner(enc);
  const me = account.address;
  const reserve = parseEther(String(cfg.gasReserveBnb || 0.003));
  const bnbBal = await pub.getBalance({ address: me });
  const dec = (await tokenMeta(token)).decimals;
  const tax = taxFor(token, cfg);
  let amountIn: bigint;

  if (d.action === "compra") {
    const free = bnbBal > reserve ? bnbBal - reserve : 0n;
    amountIn = cfg.sizingMode === "fixo" ? parseEther(String(cfg.buyAmount)) : (free * BigInt(Math.round(Math.min(cfg.buyAmount, 100) * 100))) / 10000n;
    if (cfg.maxExposureQuote > 0) {
      const room = parseEther(String(Math.max(0, cfg.maxExposureQuote - state.costBnb).toFixed(18)));
      if (amountIn > room) amountIn = room;
    }
    if (amountIn === 0n || amountIn > free) return { patch: { ...patch, last_error: `BNB insuficiente: deposite mais BNB na carteira do robô (reserva de gás ${formatEther(reserve)} BNB)` }, order: null };
    if (cfg.maxPriceImpactPct > 0 && priceImpactPct(amountIn, pool.bnb) > cfg.maxPriceImpactPct) return { patch: { ...patch, last_error: "Impacto de preço acima do limite da estratégia" }, order: null };
    const before = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [me] });
    const r = await sendSwap({ pub, wallet, me, token, side: "compra", amountIn, path: [WBNB, token], slippagePct: cfg.maxSlippagePct, taxPct: tax.buy, userId: bot.user_id, pair: pool.pair, source: "robo" });
    if (r.order.status !== "confirmada") return { patch: { ...patch, last_error: r.order.error }, order: r.order };
    const after = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [me] });
    const got = Number(formatUnits(after - before, dec));
    return { patch: { ...patch, strat_state: afterTrade(state, d, { priceUsd, bnb: Number(formatEther(amountIn)), tokens: got, now }) }, order: r.order };
  }

  if (bnbBal < reserve) return { patch: { ...patch, last_error: "BNB insuficiente para o gás da venda" }, order: null };
  const bal = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [me] });
  const pos = parseUnits(state.tokens.toFixed(Math.min(dec, 8)), dec);
  const base = pos > 0n && pos < bal ? pos : bal;
  amountIn = d.all ? base : (base * BigInt(Math.round(d.sellPct * 100))) / 10000n;
  if (amountIn === 0n) return { patch: { ...patch, last_error: "Sem tokens para vender", strat_state: { ...state, tokens: 0, entries: 0, avgPriceUsd: 0 } }, order: null };
  if (cfg.maxPriceImpactPct > 0 && priceImpactPct(amountIn, pool.tok) > cfg.maxPriceImpactPct) return { patch: { ...patch, last_error: "Impacto de preço acima do limite da estratégia" }, order: null };
  const allowance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [me, PANCAKE_V2_ROUTER] });
  if (allowance < amountIn) await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [PANCAKE_V2_ROUTER, amountIn] }) });
  const r = await sendSwap({ pub, wallet, me, token, side: "venda", amountIn, path: [token, WBNB], slippagePct: cfg.maxSlippagePct, taxPct: tax.sell, userId: bot.user_id, pair: pool.pair, source: "robo" });
  if (r.order.status !== "confirmada") return { patch: { ...patch, last_error: r.order.error }, order: r.order };
  return { patch: { ...patch, strat_state: afterTrade(state, d, { priceUsd, bnb: Number(formatEther(r.net)), tokens: Number(formatUnits(amountIn, dec)), now }) }, order: r.order };
}
