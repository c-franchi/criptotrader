import Decimal from "decimal.js";
import { Check } from "lucide-react";
import { Button } from "./ui/button";

const percentages = [25, 50, 75, 100] as const;

/** Reflect the actual budget rather than keeping a separate, potentially stale selection. */
export function BudgetPercentageSelector({
  available,
  value,
  disabled = false,
  onSelect,
}: {
  available: string | null;
  value: string;
  disabled?: boolean;
  onSelect: (percentage: number) => void;
}) {
  let selected: number | null = null;
  let customPercentage: string | null = null;
  let canCalculate = false;
  try {
    const total = new Decimal(available ?? "NaN");
    const amount = new Decimal(value || "NaN");
    canCalculate = total.isFinite() && total.gt(0);
    if (canCalculate && amount.isFinite() && amount.gte(0)) {
      selected =
        percentages.find((pct) =>
          amount.eq(total.mul(pct).div(100).toFixed(18, Decimal.ROUND_DOWN)),
        ) ?? null;
      const percentage = amount.div(total).mul(100);
      customPercentage =
        percentage.gt(0) && percentage.lt(0.01)
          ? "menos de 0,01%"
          : `${percentage.toDecimalPlaces(2).toNumber().toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
    }
  } catch {
    // Missing/invalid balances or an empty field must not imply an allocation.
  }

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-semibold">Porcentagem do valor disponível</legend>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex min-h-14 flex-wrap items-center justify-between gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2"
      >
        <span className="text-base font-bold">
          {selected != null
            ? `${selected}% selecionado`
            : customPercentage != null
              ? "Valor personalizado"
              : "Nenhuma porcentagem selecionada"}
        </span>
        <span className="text-sm text-muted-foreground">
          {selected != null
            ? "do valor disponível"
            : customPercentage != null
              ? `${customPercentage} do disponível`
              : "Escolha abaixo ou digite o valor"}
        </span>
      </p>
      <div className="grid grid-cols-4 gap-2">
        {percentages.map((pct) => (
          <Button
            key={pct}
            type="button"
            variant={selected === pct ? "default" : "outline"}
            aria-pressed={selected === pct}
            disabled={disabled || !canCalculate}
            className={`relative h-auto min-h-16 w-full flex-col gap-0.5 px-1 pb-2 pt-5 text-base font-bold ${selected === pct ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-2"}`}
            onClick={() => onSelect(pct)}
          >
            {selected === pct && (
              <Check aria-hidden="true" className="absolute right-1 top-1 size-3" />
            )}
            <span>{pct === 100 ? "Máximo" : `${pct}%`}</span>
            {pct === 100 && <span className="text-xs font-medium">100%</span>}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
