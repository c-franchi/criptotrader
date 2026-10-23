import { liveRecovery } from "./liveRecovery";
import type { StrategyConfig } from "./strategy";
import type { Candle } from "./marketStats";
import { grossForNet } from "./tokens";
import { netPositionPct, stopPrice } from "./stopLoss";

/** Robot memory between ticks, saved per bot. Prices in USD, amounts in BNB / token units. */
export type BotState = {
  entries: number;
  costBnb: number; // BNB spent on the open position
  tokens: number; // tokens bought and still held by the position
  avgPriceUsd: number; // average entry price
  lastBuyUsd: number;
  peakUsd: number; // highest price since entry (trailing stop)
  tpDone: number[]; // take-profit indexes already executed
  day: string; // UTC yyyy-mm-dd of the counters below
  tradesToday: number;
  lossTodayBnb: number;
  lastTradeAt: number; // ms
  entryConsumed?: boolean;
  recoveryLowAt?: number;
  tokensRaw?: string;
  lastFillHash?: string;
  accountingEstimated?: boolean;
};

export const EMPTY_STATE: BotState = {
  entries: 0,
  costBnb: 0,
  tokens: 0,
  avgPriceUsd: 0,
  lastBuyUsd: 0,
  peakUsd: 0,
  tpDone: [],
  day: "",
  tradesToday: 0,
  lossTodayBnb: 0,
  lastTradeAt: 0,
};

export type Decision =
  | { action: "nenhuma"; reason: string }
  | { action: "compra"; reason: string; recoveryLowAt?: number }
  | { action: "venda"; reason: string; sellPct: number; tpIndex?: number; all: boolean };

export type Market = {
  priceUsd: number;
  liquidityUsd: number | null;
  high: number | null;
  closes: number[];
  closedTimes?: number[];
  historyFresh?: boolean;
  now: number;
};

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n: number) => `${Math.round(n * 10) / 10}%`;

export function normalizeState(raw: unknown, now: number): BotState {
  const s = {
    ...EMPTY_STATE,
    ...(raw && typeof raw === "object" ? (raw as Partial<BotState>) : {}),
  };
  const day = new Date(now).toISOString().slice(0, 10);
  if (s.day !== day) return { ...s, day, tradesToday: 0, lossTodayBnb: 0 };
  return s;
}

/** Groups candles (oldest first) into buckets of `minutes`, returning closes of complete buckets only. */
export function closesAt(candles: Candle[], minutes: number, now: number): number[] {
  const size = minutes * 60;
  const nowBucket = Math.floor(now / 1000 / size);
  const map = new Map<number, number>();
  for (const c of candles) {
    const b = Math.floor(c[0] / size);
    if (b < nowBucket) map.set(b, c[4]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

/**
 * Reference "top" of the window ignoring one-candle spikes: each close is replaced by the
 * median of itself and its neighbours, so a single odd trade cannot pull the buy line up.
 */
export function referenceHigh(candles: Candle[], sinceSec: number): number | null {
  const c = candles.filter((x) => x[0] >= sinceSec).map((x) => x[4]);
  if (!c.length) return null;
  if (c.length < 3) return Math.max(...c);
  let top = 0;
  for (let i = 0; i < c.length; i++) {
    const w = [c[Math.max(0, i - 1)]!, c[i]!, c[Math.min(c.length - 1, i + 1)]!].sort(
      (a, b) => a - b,
    );
    top = Math.max(top, w[1]!);
  }
  return top;
}

export const intervalMinutes = (s: string) => {
  const m = /^(\d+)(m|h)$/.exec(s);
  return m ? Number(m[1]) * (m[2] === "h" ? 60 : 1) : 15;
};

export type Regime = {
  kind: "lateral" | "alta" | "queda";
  lo: number;
  hi: number;
  rangePct: number;
  slow: number;
  targetNetPct: number;
  targetGrossPct: number;
};

/** Net profit wanted per regime: short when the price is flat, longer when trending up. */
const NET_TARGET = { lateral: 1.5, alta: 4, queda: 1 } as const;

/** Reads the market pattern from closed candles (needs maSlow+1 closes). */
export function readRegime(cfg: StrategyConfig, closes: number[]): Regime | null {
  const n = Math.max(cfg.maSlow, 20);
  if (closes.length < n) return null;
  const w = closes.slice(-n);
  const lo = Math.min(...w),
    hi = Math.max(...w);
  const rangePct = (hi / lo - 1) * 100;
  const fast = avg(closes.slice(-cfg.maFast)),
    slow = avg(closes.slice(-cfg.maSlow));
  // New recovery strategies can recognize a wide sideways range; old exits stay unchanged.
  const efficiency = hi > lo ? Math.abs(w.at(-1)! - w[0]!) / (hi - lo) : 0;
  const kind = (cfg.recovery?.enabled ? rangePct < 8 || efficiency < 0.6 : rangePct < 8)
    ? "lateral"
    : fast > slow
      ? "alta"
      : "queda";
  const tax = { buy: cfg.buyTaxPct ?? 0, sell: cfg.sellTaxPct ?? 0 };
  const targetNetPct = cfg.recovery?.enabled
    ? Math.max(NET_TARGET[kind], cfg.recovery.minNetPct)
    : NET_TARGET[kind];
  return {
    kind,
    lo,
    hi,
    rangePct,
    slow,
    targetNetPct,
    targetGrossPct: grossForNet(targetNetPct, tax),
  };
}

/** One decision per tick, following the saved strategy. Never more than one action. */
export function decide(cfg: StrategyConfig, s: BotState, m: Market): Decision {
  const p = m.priceUsd;
  if (!(p > 0) || !Number.isFinite(p))
    return { action: "nenhuma", reason: "Preço indisponível — aguardando" };

  const holding = s.tokens > 0 && s.avgPriceUsd > 0;
  if (holding) {
    const change = (p / s.avgPriceUsd - 1) * 100;
    const stop = stopPrice(s.avgPriceUsd, cfg);
    if (stop != null && p <= stop + stop * 1e-11)
      return {
        action: "venda",
        reason:
          cfg.stopLossMode === "liquido"
            ? `Stop por perda líquida: perda estimada ${fmt(-netPositionPct(p, s.avgPriceUsd, cfg))}, incluindo taxas de compra e venda, sem gás e variação da execução`
            : `Stop-loss: caiu ${fmt(-change)} do preço médio`,
        sellPct: 100,
        all: true,
      };
    const peak = Math.max(s.peakUsd, p);
    if (
      cfg.trailingEnabled &&
      cfg.trailingDistancePct > 0 &&
      peak >= s.avgPriceUsd * (1 + cfg.trailingActivatePct / 100) &&
      p <= peak * (1 - cfg.trailingDistancePct / 100)
    )
      return {
        action: "venda",
        reason: `Trailing stop: recuou ${fmt((1 - p / peak) * 100)} do topo`,
        sellPct: 100,
        all: true,
      };
    if (cfg.entryType === "adaptativa") {
      const r = readRegime(cfg, m.closes);
      const tax = { buy: cfg.buyTaxPct ?? 0, sell: cfg.sellTaxPct ?? 0 };
      const gross = r
        ? r.targetGrossPct
        : grossForNet(Math.max(NET_TARGET.alta, cfg.recovery?.minNetPct ?? 0), tax);
      if (change >= gross - 1e-9)
        return {
          action: "venda",
          reason: `Meta adaptativa (${r?.kind ?? "sem histórico"}): subiu ${fmt(change)}, lucro líquido ~${r?.targetNetPct ?? NET_TARGET.alta}% já descontando as taxas`,
          sellPct: 100,
          all: true,
        };
    }
    const tps = cfg.takeProfits
      .map((t, i) => ({ ...t, i }))
      .filter((t) => t.pct > 0 && !s.tpDone.includes(t.i))
      .sort((a, b) => a.pct - b.pct);
    const hit = tps.find((t) => change >= t.pct - 1e-9);
    if (hit) {
      // Preserve existing cycles; new rule versions respect the percentage of every target.
      const last =
        cfg.rulesVersion === 2 ? hit.sellPct >= 100 : tps.length === 1 || hit.sellPct >= 100;
      return {
        action: "venda",
        reason: `Take-profit ${hit.i + 1}: subiu ${fmt(change)} (meta +${hit.pct}%)`,
        sellPct: last ? 100 : hit.sellPct,
        tpIndex: hit.i,
        all: last,
      };
    }
  }

  if (cfg.minLiquidityUsd > 0 && (m.liquidityUsd == null || m.liquidityUsd < cfg.minLiquidityUsd))
    return { action: "nenhuma", reason: "Liquidez do pool abaixo do mínimo da estratégia" };
  if (cfg.maxTradesPerDay > 0 && s.tradesToday >= cfg.maxTradesPerDay)
    return {
      action: "nenhuma",
      reason: `Limite de ${cfg.maxTradesPerDay} operações por dia atingido`,
    };

  if (
    cfg.rulesVersion === 2 &&
    s.entryConsumed &&
    cfg.entryType !== "queda" &&
    !cfg.recovery?.enabled
  )
    return { action: "nenhuma", reason: "Sinal já utilizado: aguardando novo recuo após rearme" };
  if (cfg.cooldownMin > 0 && m.now - s.lastTradeAt < cfg.cooldownMin * 60_000)
    return { action: "nenhuma", reason: `Pausa entre operações (${cfg.cooldownMin} min)` };
  if (s.entries >= Math.max(1, cfg.maxEntries))
    return {
      action: "nenhuma",
      reason: holding
        ? "Posição aberta — esperando meta de venda ou stop"
        : "Máximo de compras atingido",
    };
  if (cfg.maxExposureQuote > 0 && s.costBnb >= cfg.maxExposureQuote)
    return { action: "nenhuma", reason: "Limite de BNB investido atingido" };
  if (cfg.dailyLossLimit > 0 && s.lossTodayBnb >= cfg.dailyLossLimit)
    return { action: "nenhuma", reason: "Limite de perda do dia atingido — compras pausadas" };
  if (!(cfg.buyAmount > 0)) return { action: "nenhuma", reason: "Estratégia sem valor de compra" };

  if (cfg.recovery?.enabled) {
    if (holding)
      return {
        action: "nenhuma",
        reason: "Recuperação: posição aberta; sem recompra, aguardando saída ou proteção",
      };
    const recovery = liveRecovery(cfg, m, s.recoveryLowAt ?? 0);
    return recovery.ready
      ? { action: "compra", reason: recovery.reason, recoveryLowAt: recovery.lowAt }
      : { action: "nenhuma", reason: recovery.reason };
  }
  if (cfg.entryType === "queda") {
    if (!(cfg.dropPct > 0)) return { action: "nenhuma", reason: "Estratégia sem % de queda" };
    let ref = cfg.referenceType === "manual" ? cfg.manualReference : m.high;
    if (s.entries > 0 && s.lastBuyUsd > 0) ref = ref ? Math.min(ref, s.lastBuyUsd) : s.lastBuyUsd;
    if (!ref || !(ref > 0))
      return { action: "nenhuma", reason: "Sem preço de referência — aguardando histórico" };
    const at = ref * (1 - cfg.dropPct / 100);
    if (p <= at)
      return {
        action: "compra",
        reason: `Caiu ${fmt((1 - p / ref) * 100)} da referência (gatilho ${cfg.dropPct}%)`,
      };
    return {
      action: "nenhuma",
      reason: `Esperando cair até US$ ${at.toPrecision(4)} (faltam ${fmt((p / at - 1) * 100)})`,
    };
  }
  if (cfg.entryType === "adaptativa") {
    const r = readRegime(cfg, m.closes);
    if (!r)
      return { action: "nenhuma", reason: "Juntando histórico para reconhecer o padrão do preço" };
    if (r.kind === "queda")
      return {
        action: "nenhuma",
        reason: "Padrão de queda — o robô não compra enquanto o preço cai",
      };
    if (r.kind === "lateral") {
      if (r.rangePct < r.targetGrossPct)
        return {
          action: "nenhuma",
          reason: `Preço parado, mas a faixa (${fmt(r.rangePct)}) é menor que o necessário para pagar as taxas e lucrar (${fmt(r.targetGrossPct)})`,
        };
      const at = r.lo + (r.hi - r.lo) * 0.25;
      if (p <= at)
        return {
          action: "compra",
          reason: `Preço parado: comprando na parte de baixo da faixa, meta curta de +${fmt(r.targetGrossPct)} (já cobre as taxas)`,
        };
      return {
        action: "nenhuma",
        reason: `Preço parado — esperando cair até US$ ${at.toPrecision(4)} (parte de baixo da faixa)`,
      };
    }
    if (p <= r.slow)
      return {
        action: "compra",
        reason: `Padrão de alta: preço recuou até a média, meta de +${fmt(r.targetGrossPct)} (já cobre as taxas)`,
      };
    return {
      action: "nenhuma",
      reason: `Padrão de alta — esperando recuar até US$ ${r.slow.toPrecision(4)}`,
    };
  }
  const c = m.closes;
  if (!(cfg.maSlow > cfg.maFast) || c.length < cfg.maSlow + 1)
    return { action: "nenhuma", reason: "Histórico insuficiente para as médias" };
  const fast = avg(c.slice(-cfg.maFast)),
    slow = avg(c.slice(-cfg.maSlow));
  const pf = avg(c.slice(-cfg.maFast - 1, -1)),
    ps = avg(c.slice(-cfg.maSlow - 1, -1));
  void pf;
  void ps;
  // Buy low inside an uptrend: trend is up (short avg above long) AND the price dipped to the long average or below.
  if (fast > slow && p <= slow)
    return {
      action: "compra",
      reason: `Tendência de alta e o preço recuou até a média de ${cfg.maSlow} (comprando na baixa)`,
    };
  return {
    action: "nenhuma",
    reason:
      fast > slow
        ? `Tendência de alta — esperando o preço recuar até US$ ${slow.toPrecision(4)} para comprar barato`
        : "Tendência de queda — o robô não compra enquanto o preço cai",
  };
}

/** Applies a confirmed trade to the robot memory. */
export function afterTrade(
  s: BotState,
  d: Decision,
  t: { priceUsd: number; bnb: number; tokens: number; now: number },
): BotState {
  const base = { ...s, tradesToday: s.tradesToday + 1, lastTradeAt: t.now };
  if (d.action === "compra") {
    const tokens = s.tokens + t.tokens;
    const avgPriceUsd =
      tokens > 0 ? (s.avgPriceUsd * s.tokens + t.priceUsd * t.tokens) / tokens : 0;
    return {
      ...base,
      entryConsumed: true,
      ...(d.recoveryLowAt != null ? { recoveryLowAt: d.recoveryLowAt } : {}),
      entries: s.entries + 1,
      costBnb: s.costBnb + t.bnb,
      tokens,
      avgPriceUsd,
      lastBuyUsd: t.priceUsd,
      peakUsd: Math.max(s.peakUsd, t.priceUsd),
    };
  }
  if (d.action !== "venda") return s;
  const frac = s.tokens > 0 ? Math.min(1, t.tokens / s.tokens) : 1;
  const cost = s.costBnb * frac;
  const loss = Math.max(0, cost - t.bnb);
  const out = { ...base, lossTodayBnb: s.lossTodayBnb + loss };
  if (d.all || frac >= 0.999)
    return {
      ...out,
      entries: 0,
      costBnb: 0,
      tokens: 0,
      avgPriceUsd: 0,
      lastBuyUsd: 0,
      peakUsd: 0,
      tpDone: [],
    };
  return {
    ...out,
    costBnb: s.costBnb - cost,
    tokens: s.tokens - t.tokens,
    tpDone: d.tpIndex === undefined ? s.tpDone : [...s.tpDone, d.tpIndex],
  };
}

/** Only a new signal cycle may buy again; limits do not themselves rearm the signal. */
export function updateEntryLatch(cfg: StrategyConfig, s: BotState, m: Market): BotState {
  if (cfg.rulesVersion !== 2 || !s.entryConsumed || cfg.entryType === "queda") return s;
  const unrestricted = {
    ...cfg,
    cooldownMin: 0,
    maxTradesPerDay: 0,
    dailyLossLimit: 0,
    maxExposureQuote: 0,
    minLiquidityUsd: 0,
    maxEntries: 999,
  };
  const raw = decide(unrestricted, { ...s, entryConsumed: false, tokens: 0, avgPriceUsd: 0 }, m);
  return raw.action === "compra" ? s : { ...s, entryConsumed: false };
}
