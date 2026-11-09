import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

export function ReplaceChartPlanDialog({
  open,
  onOpenChange,
  walletName,
  symbol,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  walletName: string;
  symbol: string;
  busy: boolean;
  error: string;
  onConfirm: () => void;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    if (open) setAccepted(false);
  }, [open]);
  useEffect(() => {
    if (error) setAccepted(false);
  }, [error]);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Substituir pela nova atividade?</AlertDialogTitle>
          <AlertDialogDescription>
            {walletName} · {symbol}. A atividade anterior será pausada e substituída pelas regras
            que você acabou de revisar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>
            Os tokens anteriores continuam na carteira. Eles não serão vendidos nem incluídos nas
            compras e saídas da nova atividade.
          </li>
          <li>O histórico e o registro da posição anterior serão preservados.</li>
          <li>A nova atividade será salva pausada. Você decide quando iniciar.</li>
          <li>Uma transação já enviada precisa terminar a conferência antes da substituição.</li>
        </ul>
        <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            disabled={busy}
            className="mt-0.5 size-5 shrink-0"
          />
          Entendo que os tokens anteriores ficarão fora da nova atividade e sem as regras
          automáticas anteriores.
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="min-h-12!">
            Manter atividade anterior
          </AlertDialogCancel>
          <Button
            type="button"
            className="min-h-12! whitespace-normal"
            disabled={!accepted || busy}
            onClick={onConfirm}
          >
            {busy ? "Salvando…" : "Confirmar substituição e salvar pausado"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
