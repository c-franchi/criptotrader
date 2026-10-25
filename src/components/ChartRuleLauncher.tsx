import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { ChartPlanWizard } from "./ChartPlanWizard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
export { ChartPlanWizard as ChartRuleEditor } from "./ChartPlanWizard";

type Props = {
  token: string;
  symbol: string;
  onSaved?: (() => void | Promise<void>) | undefined;
  label?: string;
};
export function ChartRuleLauncher(props: Props) {
  const { user } = useAuth();
  const selection = useSelectedWallet();
  return (
    <Launcher
      key={`${user?.id}:${selection.walletScope}:${props.token.toLowerCase()}`}
      {...props}
      userId={user?.id ?? ""}
      walletScope={selection.walletScope}
      walletName={selection.name}
      sourceAddress={selection.address}
      ready={selection.ready}
    />
  );
}
function Launcher(
  props: Props & {
    userId: string;
    walletScope: string;
    walletName: string;
    sourceAddress: string | null;
    ready: boolean;
  },
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="my-2"
        disabled={!props.userId || !props.ready}
        onClick={() => setOpen(true)}
      >
        {props.label ?? "Criar regra pelo gráfico"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="exchange-workspace max-h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Criar regra pelo gráfico · {props.symbol}</DialogTitle>
            <DialogDescription>
              {props.walletName} · marque preços para uma operação futura. Salvar mantém o robô
              pausado.
            </DialogDescription>
          </DialogHeader>
          {open && <ChartPlanWizard {...props} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
