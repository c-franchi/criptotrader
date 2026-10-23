import { useId } from "react";
export type PickableToken = { address: string; symbol: string; name?: string };
/** Controlled selector shared by every token-selection surface. Selection never starts a bot. */
export function TokenPicker({
  tokens,
  value,
  onChange,
  disabled = false,
  label = "Token selecionado",
  showName = true,
}: {
  tokens: PickableToken[];
  value: string;
  onChange: (address: string) => void;
  disabled?: boolean;
  label?: string;
  showName?: boolean;
}) {
  const id = useId();
  const selected = tokens.find((t) => t.address.toLowerCase() === value.toLowerCase());
  return (
    <div data-token-picker className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-bold text-primary"
      >
        {selected?.symbol.slice(0, 1) ?? "●"}
      </span>
      <div className="min-w-0">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-full rounded-lg border border-border bg-background px-2 py-2 text-base font-semibold sm:text-lg"
        >
          {tokens.map((t) => (
            <option key={t.address} value={t.address}>
              {t.symbol}
            </option>
          ))}
        </select>
        {showName && selected?.name && (
          <p className="mt-1 text-xs text-muted-foreground">{selected.name}</p>
        )}
      </div>
    </div>
  );
}
