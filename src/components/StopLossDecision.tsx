import { stopRealLossPct } from "@/lib/stopLoss";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useEffect, useState } from "react";
export function StopLossDecision({
  open,
  onOpenChange,
  value,
  onChange,
  onConfirm,
  busy = false,
  buyTax = 0,
  sellTax = 0,
  mode = "preco",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: number;
  onChange: (value: number) => void;
  onConfirm: () => void;
  busy?: boolean;
  buyTax?: number;
  sellTax?: number;
  mode?: "preco" | "liquido";
}) {
  const loss = stopRealLossPct({
    stopLossPct: value,
    stopLossMode: mode,
    buyTaxPct: buyTax,
    sellTaxPct: sellTax,
  });
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    if (open) setChosen(false);
  }, [open]);
  const change = (n: number) => {
    onChange(n);
    setChosen(true);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setChosen(false);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deseja manter o stop-loss?</DialogTitle>
          <DialogDescription>
            Escolha explicitamente antes de salvar. O sistema não decide com base nas taxas do
            token.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          O percentual segue o modo de cálculo selecionado (preço ou perda líquida estimada). Com
          stop, uma queda pode provocar a venda e realizar prejuízo. Taxas do token, gás e execução
          podem aumentar a perda. Sem stop, você mantém os tokens quando este limite de queda seria
          atingido, mas eles podem continuar caindo até perder todo o valor. Recuperação e ganhos
          nunca são garantidos.
        </p>
        <p className="text-sm">
          Desativar este stop não desativa metas de venda, stop móvel ou outras saídas. Confira
          todas as regras.
        </p>
        <p className="rounded-xl bg-secondary p-3 text-sm">
          Taxas informadas do token: compra {buyTax}% · venda {sellTax}%.{" "}
          {loss != null
            ? `No gatilho escolhido, a perda estimada é ${loss.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%, antes de gás, DEX, slippage e impacto. A perda executada pode ser maior.`
            : "Sem stop fixo: não há um limite de perda definido por este mecanismo."}
        </p>
        <div className="space-y-2">
          <Button
            className="w-full"
            variant="outline"
            disabled={busy || !(value > 0)}
            onClick={() => change(value)}
          >
            Manter stop atual {value > 0 ? `(${value}%)` : "(desativado)"}
          </Button>
          <label className="block text-sm">
            Ajustar limite (%)
            <Input
              disabled={busy}
              type="number"
              min="0"
              max="99.99"
              step="any"
              value={value}
              onChange={(e) => change(Number(e.target.value))}
            />
          </label>
          <Button
            className="w-full"
            variant={value === 0 && chosen ? "default" : "outline"}
            disabled={busy}
            onClick={() => change(0)}
          >
            Manter tokens sem stop-loss fixo
          </Button>
        </div>
        <p role="status" className="text-sm font-semibold">
          Escolha: {value > 0 ? `stop de ${value}%` : "stop desativado"}
          {!chosen && " · confirme uma opção"}
        </p>
        <Button
          disabled={busy || !chosen || !Number.isFinite(value) || value < 0 || value >= 100}
          onClick={onConfirm}
        >
          {busy ? "Salvando…" : "Confirmar escolha e salvar regras"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
