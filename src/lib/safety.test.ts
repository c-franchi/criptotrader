import { describe, expect, it } from "vitest";
import { toFunctionSelector } from "viem";
import { liquidityBlock, scanBytecode, slippageLevel } from "./safety";

describe("safety", () => {
  it("blocks robot buys below the liquidity floor or when unknown", () => {
    expect(liquidityBlock(1500)).toMatch(/bloqueada/);
    expect(liquidityBlock(null)).toMatch(/indisponível/);
    expect(liquidityBlock(2500)).toBeNull();
    expect(liquidityBlock(2500, 5000)).toMatch(/5000/);
  });
  it("classifies slippage", () => {
    expect(slippageLevel(3)).toBe("ok");
    expect(slippageLevel(8)).toBe("cautela");
    expect(slippageLevel(15)).toBe("critico");
  });
  it("finds risky selectors in bytecode", () => {
    const code = "0x6080" + "63" + toFunctionSelector("pause()").slice(2) + "14";
    expect(scanBytecode(code).map((r) => r.label)).toEqual(["Pode pausar todas as transferências"]);
    expect(scanBytecode("0x6080604052")).toEqual([]);
  });
});
