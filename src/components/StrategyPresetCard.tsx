import { Check } from "lucide-react";
import { Button } from "./ui/button";
import type { PRESETS } from "@/lib/presets";
export function StrategyPresetCard({
  preset,
  selected,
  edited,
  canApply,
  onApply,
}: {
  preset: (typeof PRESETS)[number];
  selected: boolean;
  edited: boolean;
  canApply: boolean;
  onApply: () => void;
}) {
  return (
    <div className="mt-3 min-w-0 max-w-full space-y-3 rounded-md border-2 border-primary bg-primary/10 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="font-semibold text-primary">{preset.name}</p>
        <span className="max-w-full rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
          Funciona no Robô automático
        </span>
      </div>
      <p className="text-sm">{preset.summary}</p>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Como funciona
        </p>
        <ul className="space-y-1.5 text-sm">
          {preset.how.map((h) => (
            <li key={h} className="flex min-w-0 items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 break-words">{h}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 rounded-md bg-background/60 p-2.5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Para quem é
        </p>
        <p className="text-sm">{preset.forWho}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Esta estratégia pode ser usada no robô real. Aplicar uma estratégia não liga um robô
        desligado; se houver posição aberta ou execução pendente, as regras reais ficam preservadas
        e os ajustes são salvos como rascunho.
      </p>
      <Button
        className="w-full"
        variant={selected && !edited ? "default" : "outline"}
        disabled={!canApply}
        onClick={onApply}
      >
        {selected ? (
          <>
            <Check className="h-4 w-4" />
            {edited ? "Reaplicar com este valor" : "Em uso"}
          </>
        ) : (
          "Usar esta estratégia"
        )}
      </Button>
      {!canApply && (
        <p className="text-xs text-destructive">
          Digite o valor no passo 3 para montar a estratégia.
        </p>
      )}
    </div>
  );
}
