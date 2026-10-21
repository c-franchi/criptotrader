/* eslint-disable @typescript-eslint/no-explicit-any */
import Decimal from "decimal.js";
import { strategySchema } from "./strategyValidation";
import { formatEther, formatUnits, getAddress, parseEther, parseUnits } from "viem";
import { PANCAKE_V2_ROUTER, WBNB, erc20Abi, priceImpactPct } from "./pancake";
import { botSigner, poolState, pubClient, sendSwap, approveForSwap } from "./bot.server";
import { tokenMeta } from "./tokenMeta.server";
import { readMarket } from "./market.server";
import { readCandles } from "./history.server";
import {
  updateEntryLatch,
  closesAt,
  referenceHigh,
  decide,
  intervalMinutes,
  normalizeState,
} from "./autoStrategy";
import { closedTail } from "./candleSeries";
import { hasVerifiedTax, taxFor } from "./tokens";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";

type Bot = { id: string; user_id: string; token: string; strat_state: unknown };

/** Runs one tick of the robot following the user's saved strategy for this token. At most one swap. */
export async function runStrategyStep(admin: any, bot: Bot, enc: string, owner: string) {
  const now = Date.now();
  const { data: strat } = await admin
    .from("strategies")
    .select("config")
    .eq("user_id", bot.user_id)
    .ilike("token", bot.token)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!strat)
    return {
      patch: { last_error: "Nenhuma estratégia salva para este token", last_reason: null },
      order: null,
    };
  const saved: StrategyConfig = { ...EMPTY_CONFIG, ...(strat.config as Partial<StrategyConfig>) };
  const valid = strategySchema.safeParse(saved);
  if (!valid.success)
    return {
      patch: { last_error: "Configuração inválida: revise os limites da estratégia" },
      order: null,
    };
  const knownTax = taxFor(bot.token, saved);
  const cfg: StrategyConfig = { ...saved, buyTaxPct: knownTax.buy, sellTaxPct: knownTax.sell };
  let state = normalizeState(bot.strat_state, now);
  const token = getAddress(bot.token);
  const rpc = process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org";

  const market = await readMarket(token, rpc);
  const pool = await poolState(token);
  const best = market.pools.find(
    (p) => p.supported && p.pairAddress.toLowerCase() === pool?.pair.toLowerCase() && p.priceUsd,
  );
  const priceUsd = Number(best?.priceUsd);
  if (!best || !(priceUsd > 0))
    return {
      patch: {
        last_error: null,
        last_reason: "Preço indisponível — aguardando",
        strat_state: state,
      },
      order: null,
    };
  let candles: Awaited<ReturnType<typeof readCandles>> = [];
  try {
    candles = await readCandles(best.pairAddress.toLowerCase(), token.toLowerCase());
  } catch {
    /* history unavailable */
  }
  const high = referenceHigh(candles, now / 1000 - cfg.windowHours * 3600);
  const closes = closesAt(candles, intervalMinutes(cfg.candleInterval), now);
  if (state.tokens > 0) state.peakUsd = Math.max(state.peakUsd, priceUsd);

  if (market.error || now - new Date(market.fetchedAt).getTime() > 60_000)
    return { patch: { last_error: "Preço desatualizado: aguardando nova consulta" }, order: null };
  const minutes = intervalMinutes(cfg.candleInterval);
  const complete = closedTail(candles, minutes, now);
  const fresh =
    complete.length > 0 &&
    now - ((complete.at(-1)?.[0] ?? 0) + minutes * 60) * 1000 < minutes * 60_000 * 2;
  const signals = cfg.rulesVersion === 2 ? complete.map((c) => c[4]) : closes;
  const observation = { priceUsd, liquidityUsd: best.liquidityUsd, high, closes: signals, now };
  if (fresh) state = updateEntryLatch(cfg, state, observation);
  const d = decide(cfg, state, observation);
  if (
    d.action === "compra" &&
    (!fresh || (cfg.entryType !== "queda" && complete.length < cfg.maSlow + 1))
  )
    return {
      patch: {
        strat_state: state,
        last_error: "Histórico fechado e contínuo insuficiente ou antigo; novas entradas pausadas",
      },
      order: null,
    };
  if (d.action === "compra" && !hasVerifiedTax(token, saved))
    return {
      patch: { last_error: "Taxas desconhecidas: confirme as taxas na estratégia" },
      order: null,
    };
  const snapshot = {
    version: cfg.rulesVersion === 2 ? "live-v2" : "live-v1-compatible",
    at: now,
    token,
    pool: best.pairAddress,
    config: cfg,
    state: { ...state },
    priceUsd,
    high,
    closes,
    decision: d,
    source: market.source,
    historyThrough: candles.at(-1)?.[0] ?? null,
    indicator:
      cfg.rulesVersion === 2 ? "SMA; contiguous complete closes" : "SMA; legacy bucket closes",
    stopFormula:
      cfg.stopLossMode === "liquido"
        ? "(price / avgPriceUsd × (1-buyTax/100) × (1-sellTax/100) - 1) × 100"
        : "(price / avgPriceUsd - 1) × 100",
    proceedsAccounting: "legacy quote estimate; not confirmed native wallet proceeds",
  };
  if (d.action !== "nenhuma") {
    const { error } = await admin
      .from("audit_log")
      .insert({ user_id: bot.user_id, action: "robot_signal", details: snapshot });
    if (error) throw new Error("Não foi possível registrar a decisão; ordem não enviada");
  }
  const patch: Record<string, unknown> = {
    last_price: priceUsd,
    last_error: null,
    last_reason: d.reason,
    ...(d.action === "nenhuma" ? { strat_state: state } : {}),
  };
  if (d.action === "nenhuma") return { patch, order: null };

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
    const { liquidityBlock } = await import("./safety");
    const liq = liquidityBlock(best.liquidityUsd, cfg.minLiquidityUsd);
    if (liq) return { patch: { ...patch, last_error: liq }, order: null };
    const { data: otherBots, error: budgetError } = await admin
      .from("grid_bots")
      .select("token,mode,gas_reserve_bnb")
      .eq("user_id", bot.user_id)
      .eq("armed", true)
      .neq("id", bot.id);
    if (budgetError) throw budgetError;
    const otherReserve = (otherBots ?? []).reduce(
      (sum: bigint, b: any) =>
        sum + parseEther(Number(b.mode === "grade" ? b.gas_reserve_bnb : 0.005).toFixed(18)),
      0n,
    );
    let free = bnbBal > reserve + otherReserve ? bnbBal - reserve - otherReserve : 0n;
    if (cfg.allocationBnb && cfg.allocationBnb > 0) {
      const room = parseEther(Math.max(0, cfg.allocationBnb - state.costBnb).toFixed(18));
      if (free > room) free = room;
    }
    amountIn =
      cfg.sizingMode === "fixo"
        ? parseEther(String(cfg.buyAmount))
        : (free * BigInt(Math.round(Math.min(cfg.buyAmount, 100) * 100))) / 10000n;
    if (cfg.maxExposureQuote > 0) {
      const room = parseEther(
        String(Math.max(0, cfg.maxExposureQuote - state.costBnb).toFixed(18)),
      );
      if (amountIn > room) amountIn = room;
    }
    if (amountIn === 0n || amountIn > free)
      return {
        patch: {
          ...patch,
          last_error: `BNB insuficiente: deposite mais BNB na carteira do robô (reserva de gás ${formatEther(reserve)} BNB)`,
        },
        order: null,
      };
    if (cfg.maxPriceImpactPct > 0 && priceImpactPct(amountIn, pool.bnb) > cfg.maxPriceImpactPct)
      return {
        patch: { ...patch, last_error: "Impacto de preço acima do limite da estratégia" },
        order: null,
      };
    const r = await sendSwap({
      pub,
      wallet,
      me,
      token,
      side: "compra",
      amountIn,
      path: [WBNB, token],
      slippagePct: cfg.maxSlippagePct,
      taxPct: tax.buy,
      userId: bot.user_id,
      pair: pool.pair,
      source: "robo",
      admin,
      owner,
      maxGasGwei: cfg.maxGasGwei,
      intent: {
        botId: bot.id,
        mode: "estrategia",
        state,
        decision: d,
        priceUsd,
        decimals: dec,
        snapshot,
      },
    });
    if (r.order.tx_hash)
      await admin.from("audit_log").insert({
        user_id: bot.user_id,
        action: "robot_decision",
        details: {
          ...snapshot,
          hash: r.order.tx_hash,
          amountIn: amountIn.toString(),
          quotedOut: r.net.toString(),
          status: r.order.status,
        },
      });
    if (r.order.status !== "confirmada")
      return { patch: { ...patch, last_error: r.order.error }, order: r.order };
    return { patch, order: r.order };
  }

  if (bnbBal < reserve)
    return { patch: { ...patch, last_error: "BNB insuficiente para o gás da venda" }, order: null };
  const bal = await pub.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [me],
  });
  const pos =
    state.tokensRaw != null
      ? BigInt(state.tokensRaw)
      : parseUnits(new Decimal(state.tokens).toFixed(dec, Decimal.ROUND_DOWN), dec);
  const base = pos < bal ? pos : bal;
  amountIn = d.all ? base : (base * BigInt(Math.round(d.sellPct * 100))) / 10000n;
  if (amountIn === 0n)
    return {
      patch: { ...patch, last_error: "Sem tokens para vender", strat_state: state },
      order: null,
    };
  if (cfg.maxPriceImpactPct > 0 && priceImpactPct(amountIn, pool.tok) > cfg.maxPriceImpactPct)
    return {
      patch: { ...patch, last_error: "Impacto de preço acima do limite da estratégia" },
      order: null,
    };
  if (
    !(await approveForSwap({
      admin,
      owner,
      pub,
      wallet,
      me,
      token,
      amountIn,
      userId: bot.user_id,
      maxGasGwei: cfg.maxGasGwei,
    }))
  )
    return {
      patch: { ...patch, last_error: "Aprovação pendente" },
      order: { status: "enviada", side: "venda" },
    };
  const r = await sendSwap({
    pub,
    wallet,
    me,
    token,
    side: "venda",
    amountIn,
    path: [token, WBNB],
    slippagePct: cfg.maxSlippagePct,
    taxPct: tax.sell,
    userId: bot.user_id,
    pair: pool.pair,
    source: "robo",
    admin,
    owner,
    maxGasGwei: cfg.maxGasGwei,
    intent: {
      botId: bot.id,
      mode: "estrategia",
      state,
      decision: d,
      priceUsd,
      decimals: dec,
      snapshot,
    },
  });
  if (r.order.tx_hash)
    await admin.from("audit_log").insert({
      user_id: bot.user_id,
      action: "robot_decision",
      details: {
        ...snapshot,
        hash: r.order.tx_hash,
        amountIn: amountIn.toString(),
        quotedOut: r.net.toString(),
        status: r.order.status,
      },
    });
  if (r.order.status !== "confirmada")
    return { patch: { ...patch, last_error: r.order.error }, order: r.order };
  return { patch, order: r.order };
}
