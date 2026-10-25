import Decimal from "decimal.js";
import { formatEther, parseEther } from "viem";
import type { StrategyConfig } from "./strategy";
import { planGasReserve, planProgress } from "./chartPlan";
import type { BotState } from "./autoStrategy";

export type CapitalBot = {
  id: string;
  token: string;
  armed: boolean;
  mode: string;
  order_bnb: number | string;
  gas_reserve_bnb: number | string;
  strat_state: unknown;
  config?: Partial<StrategyConfig> | null | undefined;
};
const positive = (value: unknown) => {
  const n = new Decimal(typeof value === "string" || typeof value === "number" ? value : 0);
  if (!n.isFinite() || n.isNegative()) throw new Error("Valor de capital inválido");
  return n;
};
const wei = (value: unknown) => parseEther(positive(value).toFixed(18, Decimal.ROUND_DOWN));
const max0 = (n: bigint) => (n > 0n ? n : 0n);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

export function strategyBuyAmount(cfg: StrategyConfig, available: string, reserved: string) {
  const free = wei(available);
  if (cfg.sizingMode === "fixo") return wei(cfg.buyAmount);
  if ((cfg.allocationBnb ?? 0) > 0 || cfg.maxExposureQuote > 0)
    return (free * BigInt(Math.floor(Math.min(100, cfg.buyAmount) * 100))) / 10000n;
  // The percentage reservation already includes sizing. Do not apply it twice.
  return min(wei(reserved), free);
}

/** Logical reservations, recomputed under the wallet execution mutex before each buy.
 * Invested cost is already outside the liquid BNB balance: never subtract it twice.
 * A stopped bot retains its position but reserves no capital for new entries.
 */
export function walletCapital(balanceBnb: string, bots: CapitalBot[], previewId?: string) {
  const balance = wei(balanceBnb);
  const gasFor = (b: CapitalBot) =>
    wei(
      b.mode === "grade"
        ? b.gas_reserve_bnb
        : (planGasReserve(b.config ?? {}, (b.strat_state ?? {}) as Partial<BotState>) ??
            b.config?.gasReserveBnb ??
            0.005),
    );
  const completed = (b: CapitalBot) => {
    const s = (b.strat_state ?? {}) as Partial<BotState>,
      rule = b.config?.chartRule;
    return (
      !!rule &&
      s.chartRuleConsumedId === rule.id &&
      !(Number(s.tokens) > 0) &&
      (rule.version === 2 ? !!s.chartFinished : true)
    );
  };
  const enabled = (b: CapitalBot) => (b.armed || b.id === previewId) && !!b.config && !completed(b);
  const gas = bots.filter(enabled).reduce((sum, b) => sum + gasFor(b), 0n);
  const afterGas = max0(balance - gas);
  const rows = bots.map((b) => {
    const s = (b.strat_state ?? {}) as Partial<BotState>;
    const invested = wei(s.costBnb ?? 0);
    const c = b.config;
    const caps = [c?.allocationBnb, c?.maxExposureQuote].filter(
      (n): n is number => typeof n === "number" && n > 0,
    );
    const cap = caps.length ? wei(Math.min(...caps)) : null;
    let claim = 0n;
    const plan = c?.chartRule?.version === 2 ? c.chartRule : null;
    const progress = plan ? planProgress(plan, s) : null;
    const planRemaining = plan
      ? progress?.exiting || progress?.finished
        ? 0n
        : (plan.entries ?? []).reduce(
            (sum, e, i) => sum + (progress?.buys.includes(i) ? 0n : wei(e.amountBnb)),
            0n,
          )
      : null;
    if (enabled(b)) {
      if (planRemaining != null) claim = planRemaining;
      else if (cap != null) claim = max0(cap - invested);
      else if (b.mode === "grade") claim = wei(b.order_bnb);
      else if (
        c &&
        c.buyAmount &&
        (s.entries ?? 0) < (c.maxEntries ?? 1) &&
        !(c.recovery?.enabled && positive(s.tokens ?? 0).gt(0))
      ) {
        claim =
          c.sizingMode === "fixo"
            ? wei(
                positive(c.buyAmount)
                  .mul(Math.max(0, (c.maxEntries ?? 1) - (s.entries ?? 0)))
                  .toString(),
              )
            : (afterGas * BigInt(Math.floor(Math.min(100, c.buyAmount) * 100))) / 10000n;
      }
    }
    return {
      id: b.id,
      token: b.token,
      armed: b.armed,
      mode: b.mode,
      configured: !!b.config,
      eligible: enabled(b),
      reserved: claim,
      invested,
      estimated: !!s.accountingEstimated,
      gas: enabled(b) ? gasFor(b) : 0n,
      cap,
      planRemaining,
    };
  });
  const reserved = rows.reduce((sum, b) => sum + b.reserved, 0n);
  return {
    balance: formatEther(balance),
    invested: formatEther(rows.reduce((sum, b) => sum + b.invested, 0n)),
    gas: formatEther(gas),
    reserved: formatEther(reserved),
    free: formatEther(max0(afterGas - reserved)),
    shortfall: formatEther(max0(gas + reserved - balance)),
    rows: rows.map((b) => ({
      ...b,
      reserved: formatEther(b.reserved),
      invested: formatEther(b.invested),
      gas: formatEther(b.gas),
      cap: b.cap == null ? null : formatEther(b.cap),
      planRemaining: b.planRemaining == null ? null : formatEther(b.planRemaining),
      available: formatEther(
        min(
          b.eligible ? max0(afterGas - (reserved - b.reserved)) : 0n,
          b.planRemaining ?? (b.cap == null ? afterGas : max0(b.cap - b.invested)),
        ),
      ),
    })),
  };
}
