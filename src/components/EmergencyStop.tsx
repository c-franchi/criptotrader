import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { OctagonX } from "lucide-react";
import { stopAllBots } from "@/lib/emergencyStop.functions";
import { Button } from "./ui/button";

export function EmergencyStop() {
  const stop = useServerFn(stopAllBots);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const stopNow = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const result = await stop();
      setMessage(
        `${result.stopped} robô(s) desligado(s) em todas as carteiras. ` +
          "Ativos mantidos; envios já iniciados ainda podem confirmar na rede." +
          (result.auditSaved ? "" : " Não foi possível salvar o registro de auditoria."),
      );
      window.dispatchEvent(new Event("bots-emergency-stopped"));
    } catch {
      setFailed(true);
      setMessage("Parada não confirmada. Toque novamente em Parar todos os bots para conferir.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl border-t border-border px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="destructive"
          className="min-h-11 shrink-0"
          disabled={busy}
          onClick={stopNow}
        >
          <OctagonX className="mr-2 size-4" aria-hidden="true" />
          {busy ? "Parando bots…" : "Parar todos os bots"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Parada forçada · todas as carteiras · mantém os ativos, sem vender.
        </span>
      </div>
      {message && (
        <p role={failed ? "alert" : "status"} className="mt-2 break-words text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
