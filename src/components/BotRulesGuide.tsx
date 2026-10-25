import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ruleGuide } from "@/lib/botGuidance";
export type GuidedRule = {
  key: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
};
function RuleStep({ rule, next }: { rule: GuidedRule; next: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(rule.value));
  const guide = ruleGuide(rule.key);
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{rule.label}</h3>
      <p className="text-sm">{guide.explanation}</p>
      <p className="rounded-xl bg-secondary p-3 text-sm">
        Valor no formulário:{" "}
        <b>{rule.value.toLocaleString("pt-BR", { maximumFractionDigits: 12 })}</b>
        {rule.key === "stopPct" && rule.value === 0 && " · stop desativado"}
      </p>
      <details className="rounded-xl border p-3 text-sm">
        <summary>Ver fórmula e exemplo</summary>
        <p className="mt-2">{guide.formula}</p>
        <p className="mt-2 text-muted-foreground">{guide.example}</p>
      </details>
      {editing && (
        <label className="block text-sm">
          Novo valor
          <Input
            autoFocus
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setEditing(false);
            next();
          }}
        >
          Manter valor
        </Button>
        {!editing ? (
          <Button onClick={() => setEditing(true)}>Alterar</Button>
        ) : (
          <Button
            disabled={draft.trim() === "" || !Number.isFinite(Number(draft)) || Number(draft) < 0}
            onClick={() => {
              rule.onChange(Number(draft));
              next();
            }}
          >
            Usar no formulário
          </Button>
        )}
      </div>
    </div>
  );
}
/** Closing never saves or starts a bot. Each deliberate edit only changes the parent draft. */
export function BotRulesGuide({
  open,
  onOpenChange,
  fields,
  title = "Monte seu robô com orientação",
  summary = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: GuidedRule[];
  title?: string;
  summary?: string[];
}) {
  const [step, setStep] = useState(0);
  const index = Math.min(step, Math.max(0, fields.length - 1));
  const rule = fields[index];
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setStep(0);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Revise sugestões ou seus próprios valores. Nenhuma estratégia promete rentabilidade.
            Fechar mantém apenas o preenchimento; não salva nem inicia operações.
          </DialogDescription>
        </DialogHeader>
        {summary.length > 0 && (
          <details className="rounded-xl border p-3 text-sm">
            <summary>O que este modelo fará</summary>
            <ul className="mt-2 space-y-2">
              {summary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
        )}
        {rule && (
          <>
            <p className="text-xs text-muted-foreground">
              Ajuste {index + 1} de {fields.length}
            </p>
            <RuleStep
              key={`${index}:${rule.key}`}
              rule={rule}
              next={() => {
                if (index + 1 === fields.length) {
                  setStep(0);
                  onOpenChange(false);
                } else setStep(index + 1);
              }}
            />
            <div className="flex justify-between">
              <Button variant="ghost" disabled={index === 0} onClick={() => setStep(index - 1)}>
                Anterior
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(0);
                  onOpenChange(false);
                }}
              >
                Continuar no formulário
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function BotRuleHelp({ field }: { field: GuidedRule }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto px-0 text-xs text-primary"
        onClick={() => setOpen(true)}
      >
        Entender e ajustar
      </Button>
      <BotRulesGuide open={open} onOpenChange={setOpen} fields={[field]} title={field.label} />
    </>
  );
}
