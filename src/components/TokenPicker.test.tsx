import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TokenPicker } from "./TokenPicker";
afterEach(cleanup);
const tokens = [
  { address: "0x1", symbol: "BTCB", name: "Bitcoin (BSC)" },
  { address: "0x2", symbol: "ETH", name: "Ethereum (BSC)" },
];
it("uses a labelled controlled selector and changes only the selected asset", () => {
  const change = vi.fn();
  render(<TokenPicker tokens={tokens} value="0x1" onChange={change} />);
  expect(screen.getByLabelText("Token selecionado")).toHaveValue("0x1");
  fireEvent.change(screen.getByLabelText("Token selecionado"), { target: { value: "0x2" } });
  expect(change).toHaveBeenCalledWith("0x2");
});
