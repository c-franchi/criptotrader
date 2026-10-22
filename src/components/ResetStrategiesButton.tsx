import { useState } from "react";
import { toast } from "sonner";
import { resetStrategies } from "@/lib/resetStrategies.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function ResetStrategiesButton({
  walletScope,
  onDone,
}: {
  walletScope: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await resetStrategies({
        data: { walletScope, allWallets: all, confirmation: "RESETAR ESTRATÉGIAS" },
      });
      setOpen(false);
      toast.success("Estratégias e rascunhos resetados. Bots preservados e pausados.");
      if (onDone) onDone();
      else window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Resetar estratégias
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar configurações das estratégias?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove as estratégias salvas e os rascunhos e pausa os bots. Mantém bots, carteiras,
              saldo, posições e histórico. As configurações anteriores ficam registradas na
              auditoria. Será necessário configurar as estratégias novamente antes de iniciar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={all}
              disabled={busy}
              onChange={(e) => setAll(e.target.checked)}
            />
            Incluir todas as minhas carteiras (desmarcado: somente a carteira selecionada)
          </label>
          <p className="text-sm text-warning">
            Esta opção não vende ativos nem remove travas de execução. Com posição aberta ou
            transação pendente, o reset é recusado.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={() => void reset()}>
              {busy
                ? "Resetando…"
                : all
                  ? "Resetar todas as minhas estratégias"
                  : "Resetar estratégias desta carteira"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
