import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { readManualLimits, type ManualLimits } from "@/lib/manualSale";

export function ManualSaleLimitsDialog({
  open,
  onOpenChange,
  limits,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limits: ManualLimits | null;
  onSave: (limits: ManualLimits) => Promise<void>;
}) {
  const [impact, setImpact] = useState("");
  const [slippage, setSlippage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setImpact(limits ? String(limits.maxPriceImpactPct).replace(".", ",") : "");
    setSlippage(limits ? String(limits.maxSlippagePct).replace(".", ",") : "");
    setError("");
  }, [open, limits]);
  const save = async () => {
    const decimal = (s: string) =>
      /^\d+(?:[.,]\d+)?$/.test(s.trim()) ? Number(s.replace(",", ".")) : NaN;
    const next = readManualLimits({
      maxPriceImpactPct: decimal(impact),
      maxSlippagePct: decimal(slippage),
    });
    if (!next)
      return setError(
        "Defina os dois limites entre 0% e 20%. Zero é um limite explícito, não desativa a proteção.",
      );
    setBusy(true);
    setError("");
    try {
      await onSave(next);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar os ajustes.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustar limites da venda</DialogTitle>
          <DialogDescription>
            Somente vendas manuais deste token nesta carteira. As regras dos robôs não mudam.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="sale-impact">Limite de impacto de preço (%)</Label>
          <Input
            autoFocus
            id="sale-impact"
            type="text"
            inputMode="decimal"
            value={impact}
            disabled={busy}
            onChange={(e) => setImpact(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Bloqueia a cotação quando sua quantidade altera o preço do pool acima deste limite.
            Reduzir a quantidade pode reduzir o impacto.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sale-slippage">Tolerância de variação de preço — slippage (%)</Label>
          <Input
            id="sale-slippage"
            type="text"
            inputMode="decimal"
            value={slippage}
            disabled={busy}
            onChange={(e) => setSlippage(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Define quanto o recebimento pode cair entre a cotação e a execução. Um limite maior
            aceita um recebimento menor; não corrige impacto.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Permitido: 0% a 20% em cada campo. Nenhum limite aumenta automaticamente.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando…" : "Salvar ajustes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
