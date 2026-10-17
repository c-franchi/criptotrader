import { expect, it } from "vitest";
import { recoverySignal, CANDIDATE_DEFAULTS, EMPTY_SIGNAL, replayCandidate } from "./candidateStrategy";
import { EMPTY_CONFIG } from "./strategy";
import { COST_DEFAULTS } from "./costLedger";
import type { Candle } from "./backtest";
const cfg = { ...EMPTY_CONFIG, entryType: "queda" as const, candleInterval:"5m", maFast:2, maSlow:3, referenceType:"manual" as const, manualReference:100, dropPct:20, sizingMode:"fixo" as const, buyAmount:10, maxEntries:2, maxExposureQuote:20, cooldownMin:0 };
const candles = (values: number[]): Candle[] => values.map((v,i) => [(i+1)*300,v,v,v,v]);
it("arms on a pullback, requires a later rising closed candle, and does not repeat on the same close", () => {
  const a = candles([110,105,100,95,90,79]); const r = recoverySignal(a,cfg,CANDIDATE_DEFAULTS,EMPTY_SIGNAL,2_100_000);
  expect(r.signal).toBe(false); expect(r.state.armedAt).toBe(1800);
  const b = candles([110,105,100,95,90,79,81]); const s = recoverySignal(b,cfg,CANDIDATE_DEFAULTS,r.state,2_400_000);
  expect(s.signal).toBe(true);
  expect(recoverySignal(b,cfg,CANDIDATE_DEFAULTS,s.state,2_400_000).signal).toBe(false);
});
it("blocks a candidate buy when 8%/8% exceeds the configured 10% liquid loss stop", () => {
  const data = candles([100,95,90,85,80,79,81,82,83,84]);
  const r = replayCandidate(data,{...cfg,stopLossMode:"liquido",stopLossPct:10},100,{...COST_DEFAULTS,buyTaxPct:8,sellTaxPct:8,dexFeePct:0},CANDIDATE_DEFAULTS,3_600_000);
  expect(r).not.toBeNull(); expect(r?.events.filter(e => e.action === "compra")).toHaveLength(0);
  const allowed = replayCandidate(data,{...cfg,stopLossMode:"liquido",stopLossPct:30},100,{...COST_DEFAULTS,buyTaxPct:8,sellTaxPct:8,dexFeePct:0},CANDIDATE_DEFAULTS,3_600_000);
  expect(allowed?.events.filter(e => e.action === "compra").length).toBeGreaterThan(0);
});
it("a falling SMA trend never emits an Active candidate entry", () => {
  const data = candles([100,99,98,97,96,95,96]);
  expect(recoverySignal(data,{...cfg,entryType:"medias"},CANDIDATE_DEFAULTS,{...EMPTY_SIGNAL,armedAt:1500},2_400_000).signal).toBe(false);
});
it("same initial budget is used for zero and one allowed rebuys", () => {
  const data=candles([100,95,90,85,80,79,81,82,83,84]);
  const a = replayCandidate(data,cfg,100,COST_DEFAULTS,{...CANDIDATE_DEFAULTS,maxRebuys:0},3_600_000);
  const b = replayCandidate(data,cfg,100,COST_DEFAULTS,{...CANDIDATE_DEFAULTS,maxRebuys:1},3_600_000);
  expect(a?.budget).toBe(20); expect(b?.budget).toBe(20);
});