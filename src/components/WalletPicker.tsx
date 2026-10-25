import { useState } from "react";
import { Bot, Check, ChevronDown, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
export type WalletChoice = {
  id: string;
  label: string;
  detail?: string;
  value?: string;
  bot?: boolean;
};
/** Shared presentation only: choosing a wallet never authorizes a trade. */
export function WalletPicker({
  options,
  value,
  onChange,
  disabled = false,
  label = "Escolher carteira",
  manage = true,
}: {
  options: WalletChoice[];
  value: string;
  onChange: (id: string) => boolean | void;
  disabled?: boolean;
  label?: string;
  manage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((w) => w.id === value);
  const Icon = selected?.bot ? Bot : Wallet;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          disabled={disabled}
          className="h-auto min-w-0 max-w-full justify-start gap-2 rounded-full px-3 py-2.5"
          aria-label={`${label}: ${selected?.label ?? "Carteiras"}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="truncate text-base font-semibold">{selected?.label ?? "Carteiras"}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogTitle>{label}</DialogTitle>
        <DialogDescription>
          Selecione a carteira que deseja usar. Os outros robôs continuam funcionando.
        </DialogDescription>
        <div role="group" aria-label="Carteiras disponíveis" className="space-y-2">
          {options.map((w) => {
            const RowIcon = w.bot ? Bot : Wallet;
            return (
              <button
                type="button"
                key={w.id}
                aria-pressed={w.id === value}
                onClick={() => {
                  if (onChange(w.id) !== false) setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${w.id === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <RowIcon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold">{w.label}</span>
                  {w.detail && (
                    <span className="block text-xs text-muted-foreground">{w.detail}</span>
                  )}
                  {w.value && <span className="block text-sm tabular-nums">{w.value}</span>}
                </span>
                {w.id === value && (
                  <Check className="size-5 shrink-0 text-primary" aria-label="Selecionada" />
                )}
              </button>
            );
          })}
        </div>
        {manage && (
          <Button asChild variant="secondary" className="w-full rounded-full">
            <a href="/carteiras#adicionar-carteira" onClick={() => setOpen(false)}>
              Adicionar ou gerenciar carteiras
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
