import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TokenLogo } from "./TokenLogo";
afterEach(cleanup);
it("falls back from market artwork to registry and then initials without broken images", () => {
  const view = render(
    <TokenLogo
      address="0x55d398326f99059ff775485246999027b3197955"
      symbol="USDT"
      logoUrl="https://cdn.dexscreener.com/logo.png"
    />,
  );
  expect(view.container.querySelector("img")?.src).toContain("cdn.dexscreener.com");
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")?.src).toContain("trustwallet.com");
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.textContent).toBe("USD");
  view.rerender(<TokenLogo address="native" symbol="BNB" />);
  expect(view.container.querySelector("img")?.src).toContain("/smartchain/info/logo.png");
});
