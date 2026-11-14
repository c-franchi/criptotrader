import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGuidedBotSettings } from "@/lib/guidedBot.functions";
import type { StrategyConfig } from "@/lib/strategy";
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
  onStarted?: (() => void) | undefined;
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
  const settings = useQuery({
    queryKey: ["chart-plan-settings", props.userId, props.walletScope, props.token],
    queryFn: () =>
      getGuidedBotSettings({ data: { walletScope: props.walletScope, token: props.token } }),
    enabled: !!props.userId && props.ready,
    retry: false,
  });
  const editing = !!(settings.data?.strategy?.config as Partial<StrategyConfig> | undefined)
    ?.chartRule;
  const startedNavigation = useRef(false);
  return (
    <>
      <Button
        variant="outline"
        className="my-2"
        disabled={!props.userId || !props.ready}
        onClick={() => {
          startedNavigation.current = false;
          setOpen(true);
        }}
      >
        {props.label ?? (editing ? "Editar atividade e preços" : "Criar regra pelo gráfico")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="exchange-workspace max-h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-4 sm:p-6"
          onCloseAutoFocus={(event) => {
            if (startedNavigation.current) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar atividade" : "Criar regra pelo gráfico"} · {props.symbol}
            </DialogTitle>
            <DialogDescription>
              {props.walletName} ·{" "}
              {editing
                ? "revise os preços e o valor da atividade salva."
                : "marque preços para uma operação futura."}{" "}
              Salvar mantém o robô pausado.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ChartPlanWizard
              {...props}
              onClose={() => setOpen(false)}
              onStarted={() => {
                startedNavigation.current = true;
                setOpen(false);
                props.onStarted?.();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
