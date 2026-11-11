import type { Ref } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function ManualSaleAmountInput({
  symbol,
  value,
  onChange,
  disabled,
  inputRef,
}: {
  symbol: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  inputRef: Ref<HTMLInputElement>;
}) {
  return (
    <>
      <Label htmlFor="manual-trade-amount" className="mt-3 block">
        Quantidade a vender ({symbol})
      </Label>
      <Input
        ref={inputRef}
        id="manual-trade-amount"
        inputMode="decimal"
        type="text"
        value={value}
        disabled={disabled}
        className="mt-1 text-lg"
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}
