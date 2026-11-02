import { expect, it } from "vitest";
import { buildManualAutoConfig, manualAutoEntry } from "./manualAuto";
import { EMPTY_STATE, afterTrade, decide } from "./autoStrategy";
import { strategySchema } from "./strategyValidation";
import { walletCapital } from "./walletCapital";
const id = "11111111-1111-4111-8111-111111111111";
const cfg = buildManualAutoConfig(
  {
    capitalBnb: 0.01,
    entryMode: "price",
    entryValue: 100,
    exitMode: "price",
    exitValue: 101,
    stopLossPct: null,
    slippagePct: 1,
    buyTaxPct: 8,
    sellTaxPct: 8,
  },
  110,
  id,
);
const market = (priceUsd: number) => ({
  priceUsd,
  now: Date.now(),
  liquidityUsd: 0,
  high: null,
  closes: [],
  historyFresh: false,
});
it("waits for exact price and trades even when a small spread does not cover taxes", () => {
  expect(strategySchema.safeParse(cfg).success).toBe(true);
  expect(decide(cfg, EMPTY_STATE, market(100.01)).action).toBe("nenhuma");
  const buy = decide(cfg, EMPTY_STATE, market(100));
  expect(buy.action).toBe("compra");
  const held = afterTrade(EMPTY_STATE, buy, {
    priceUsd: 100,
    bnb: 0.0101,
    tokens: 10,
    now: Date.now(),
  });
  expect(decide(cfg, held, market(100.99)).action).toBe("nenhuma");
  expect(decide(cfg, held, market(101)).action).toBe("venda");
  expect(cfg.manualAuto!.exitValue).toBe(101);
});
it("freezes the percentage entry reference and calculates percentage exits from actual fills", () => {
  const c = buildManualAutoConfig(
    {
      capitalBnb: 0.01,
      entryMode: "percent",
      entryValue: 10,
      exitMode: "percent",
      exitValue: 2,
      stopLossPct: null,
      slippagePct: 1,
    },
    100,
    id,
  );
  expect(manualAutoEntry(c.manualAuto!)).toBe(90);
  expect(decide(c, EMPTY_STATE, market(91)).action).toBe("nenhuma");
  const d = decide(c, EMPTY_STATE, market(89));
  const held = afterTrade(EMPTY_STATE, d, { priceUsd: 89, bnb: 0.01, tokens: 1, now: Date.now() });
  expect(decide(c, held, market(90.77)).action).toBe("nenhuma");
  expect(decide(c, held, market(90.78)).action).toBe("venda");
});
it("without stop never sells on a drop, while an explicit stop takes priority", () => {
  const held = { ...EMPTY_STATE, tokens: 1, avgPriceUsd: 100 };
  expect(decide(cfg, held, market(5)).action).toBe("nenhuma");
  const withStop = { ...cfg, manualAuto: { ...cfg.manualAuto!, stopLossPct: 5 } };
  expect(decide(withStop, held, market(95))).toMatchObject({ action: "venda", all: true });
});
it("does not repurchase after a confirmed exit or reserve capital for a completed cycle", () => {
  const buy = decide(cfg, EMPTY_STATE, market(100));
  const held = afterTrade(EMPTY_STATE, buy, {
    priceUsd: 100,
    bnb: 0.01,
    tokens: 1,
    now: Date.now(),
  });
  const sale = decide(cfg, held, market(101));
  const flat = afterTrade(held, sale, { priceUsd: 101, bnb: 0.009, tokens: 1, now: Date.now() });
  expect(decide(cfg, flat, market(50)).action).toBe("nenhuma");
  const cap = walletCapital("1", [
    {
      id: "b",
      token: "t",
      armed: true,
      mode: "estrategia",
      order_bnb: 0.01,
      gas_reserve_bnb: 0,
      strat_state: flat,
      config: cfg,
    },
  ]);
  expect(Number(cap.reserved)).toBe(0);
});
it("accepts a loss-taking price or percentage but rejects invalid targets and mixed strategies", () => {
  expect(
    strategySchema.safeParse({ ...cfg, manualAuto: { ...cfg.manualAuto!, exitValue: 99 } }).success,
  ).toBe(true);
  expect(
    strategySchema.safeParse({
      ...cfg,
      manualAuto: { ...cfg.manualAuto!, exitMode: "percent", exitValue: -5 },
    }).success,
  ).toBe(true);
  expect(
    strategySchema.safeParse({
      ...cfg,
      manualAuto: { ...cfg.manualAuto!, entryMode: "percent", entryValue: 100 },
    }).success,
  ).toBe(false);
  expect(
    strategySchema.safeParse({ ...cfg, manualAuto: { ...cfg.manualAuto!, exitValue: 0 } }).success,
  ).toBe(false);
  expect(strategySchema.safeParse({ ...cfg, trailingEnabled: true }).success).toBe(false);
});
