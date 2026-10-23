import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { finishAutomationKeepingAssets } from "@/lib/finishAutomation";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
export function FinishAutomationButton({
  botId,
  userId,
  walletScope,
  armed,
  symbol,
  onDone,
}: {
  botId: string;
  userId: string;
  walletScope: string;
  armed: boolean;
  symbol: string;
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="outline" disabled={!armed} onClick={() => setOpen(true)}>
        {armed ? "Finalizar automação · manter moedas" : "Automação parada · moedas mantidas"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manter {symbol} e finalizar a automação?</DialogTitle>
            <DialogDescription>
              As moedas permanecem na carteira, com o custo e histórico preservados para apurar o
              resultado nos ativos. Não será enviada uma venda.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-warning">
            Compras, metas de venda e stop loss automáticos deixam de atuar. Uma transação já
            enviada ainda pode ser confirmada pela rede.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await finishAutomationKeepingAssets(
                  supabase,
                  userId,
                  walletScope,
                  botId,
                );
                setOpen(false);
                toast.success("Automação finalizada. Moedas e custo de compra mantidos.");
                if (!result.auditRecorded)
                  toast.warning(
                    "O robô parou, mas o registro desta ação não pôde ser gravado. O histórico das compras permanece.",
                  );
                await onDone();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Finalizando…" : "Confirmar · manter moedas"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Continuar com o robô
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
