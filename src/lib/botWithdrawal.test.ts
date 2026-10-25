import { expect, it } from "vitest";
import {
  chooseWithdrawalAssets,
  withdrawalBnbValue,
  withdrawalDestination,
  botWithdrawalSchema,
} from "./botWithdrawal";
import { withdrawalHistoryRow } from "./botWithdrawalHistory";
import { LEGACY_WALLET_SCOPE } from "./walletScope";
const a = "0x1111111111111111111111111111111111111111",
  b = "0x2222222222222222222222222222222222222222";
it("only selects requested contracts, keeps tokens separate and never treats a token as native BNB", () => {
  const balances = [
    { address: a, symbol: "BNB", decimals: 18, amount: 3n },
    { address: b, symbol: "B", decimals: 18, amount: 4n },
  ] as const;
  expect(chooseWithdrawalAssets([b], [...balances])).toMatchObject({
    includeBnb: false,
    tokens: [balances[1]],
    retained: [balances[0]],
  });
  expect(chooseWithdrawalAssets(undefined, [...balances])).toMatchObject({
    includeBnb: true,
    tokens: balances,
  });
  expect(() =>
    chooseWithdrawalAssets(["0x3333333333333333333333333333333333333333"], [...balances]),
  ).toThrow("Token não reconhecido");
});
it("resolves mother by immutable scope and rejects a different account or missing parent", () => {
  const saved = [
    { id: "mother-a", address: a },
    { id: "mother-b", address: b },
  ];
  expect(withdrawalDestination("mother-a", undefined, saved)).toBe(a);
  expect(() => withdrawalDestination("mother-a", b, saved)).toThrow("Destino diferente");
  expect(() => withdrawalDestination("unknown", b, saved)).toThrow("não foi localizada");
  expect(() => withdrawalDestination(LEGACY_WALLET_SCOPE, undefined, saved)).toThrow(
    "sem carteira mãe",
  );
  expect(withdrawalDestination(LEGACY_WALLET_SCOPE, b, saved)).toBe(b);
  expect(() => withdrawalDestination(LEGACY_WALLET_SCOPE, a, [])).toThrow("precisa estar salvo");
});
it("never returns the gas reserve as spendable native funds and validates exact decimal input", () => {
  expect(withdrawalBnbValue(100n, 20n, 50n)).toBe(30n);
  expect(withdrawalBnbValue(40n, 20n, 50n)).toBe(0n);
  expect(botWithdrawalSchema.safeParse({ from: a, assets: [], keepBnb: "0.1" }).success).toBe(
    false,
  );
  expect(botWithdrawalSchema.safeParse({ from: a, assets: ["BNB"], keepBnb: "-1" }).success).toBe(
    false,
  );
  expect(
    botWithdrawalSchema.safeParse({ from: a, assets: ["BNB"], keepBnb: "0.000000000000000001" })
      .success,
  ).toBe(true);
});
it("shows legacy and new journal entries without inventing received tokens or converting an unknown raw amount", () => {
  const row = {
    id: "id",
    tx_hash: "hash",
    created_at: "2026-10-25T00:00:00Z",
    finished_at: "now",
    intent: { token: a, amount: "1000000000000000000", to: b },
    receipt: { status: "success", gasBnb: "0.00001" },
  };
  expect(withdrawalHistoryRow(row, [{ address: a, symbol: "AAA", decimals: 18 }], b)).toMatchObject(
    { amount: "1", received: null, symbol: "AAA", status: "confirmada", from: b },
  );
  expect(withdrawalHistoryRow(row, []).amount).toContain("decimais não apurados");
  expect(withdrawalHistoryRow({ ...row, finished_at: null }, []).status).toBe("pendente");
  expect(
    withdrawalHistoryRow({ ...row, intent: { amount: "1000000000000000000" } }, []).received,
  ).toBe("1");
});
