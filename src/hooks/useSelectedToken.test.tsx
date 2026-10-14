import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SelectedTokenProvider, useSelectedToken } from "./useSelectedToken";

const BGA = "0xDbb962A6Fa2b9AEAf27Ec2D7fd5e820d479bdb3D";
describe("Shared token selection", () => {
  beforeEach(() => localStorage.clear());
  it("keeps BGA selected for another page and after remount", async () => {
    const first = renderHook(() => [useSelectedToken(), useSelectedToken()], { wrapper: SelectedTokenProvider });
    act(() => first.result.current[0]?.selectToken(BGA));
    expect(first.result.current[1]?.token.address).toBe(BGA);
    first.unmount();
    const next = renderHook(() => useSelectedToken(), { wrapper: SelectedTokenProvider });
    await waitFor(() => expect(next.result.current.token.address).toBe(BGA));
  });
  it("does not accept an unsupported address", () => {
    const hook = renderHook(() => useSelectedToken(), { wrapper: SelectedTokenProvider });
    act(() => hook.result.current.selectToken("0x0000000000000000000000000000000000000000"));
    expect(hook.result.current.token.symbol).toBe("GTE");
  });
});