import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SelectedTokenProvider, useSelectedToken } from "./useSelectedToken";
import { TOKENS } from "@/lib/tokens";

const ETH = "0x2170Ed0880ac9A755fd29B2688956BD959F933F8";
describe("Shared token selection", () => {
  beforeEach(() => localStorage.clear());
  it("new users only see well-known tokens (no project test tokens)", () => {
    expect(TOKENS.map((t) => t.symbol)).toEqual(["BTCB", "ETH", "SOL"]);
  });
  it("keeps ETH selected for another page and after remount", async () => {
    const first = renderHook(() => [useSelectedToken(), useSelectedToken()], {
      wrapper: SelectedTokenProvider,
    });
    act(() => first.result.current[0]?.selectToken(ETH));
    expect(first.result.current[1]?.token.address).toBe(ETH);
    first.unmount();
    const next = renderHook(() => useSelectedToken(), { wrapper: SelectedTokenProvider });
    await waitFor(() => expect(next.result.current.token.address).toBe(ETH));
  });
  it("does not accept an unsupported address", () => {
    const hook = renderHook(() => useSelectedToken(), { wrapper: SelectedTokenProvider });
    act(() => hook.result.current.selectToken("0x0000000000000000000000000000000000000000"));
    expect(hook.result.current.token.symbol).toBe("BTCB");
  });
});
