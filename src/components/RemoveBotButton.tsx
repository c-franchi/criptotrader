import { userMessage } from "@/lib/userMessage";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { removePausedBot } from "@/lib/removeBot.functions";
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

export function RemoveBotButton({
  botId,
  walletScope,
  symbol,
  armed,
  onDone,
}: {
  botId: string;
  walletScope: string;
  symbol: string;
  armed: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const remove = async () => {
    setBusy(true);
    try {
      await removePausedBot({ data: { botId, walletScope, confirmation: "REMOVER ROBÔ" } });
      await client.invalidateQueries({ queryKey: ["wallet-capital", walletScope] });
      setOpen(false);
      onDone();
      toast.success(`Robô de ${symbol} removido. Carteira e histórico preservados.`);
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (armed) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        Remover robô
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o robô de {symbol}?</AlertDialogTitle>
            <AlertDialogDescription>
              O bot pausado sairá da lista. Sua carteira, saldo, estratégia e histórico de operações
              serão mantidos. Nenhum ativo será vendido ou transferido. Você poderá criar o robô
              novamente para este token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Com posição aberta ou transação pendente na carteira, a remoção será recusada. Esta
            opção não libera travas de execução.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
              {busy ? "Removendo…" : "Confirmar remoção"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
