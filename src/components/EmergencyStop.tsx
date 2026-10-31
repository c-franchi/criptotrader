import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { OctagonX } from "lucide-react";
import { toast } from "sonner";
import { stopAllBots } from "@/lib/emergencyStop.functions";
import { Button } from "./ui/button";

export function EmergencyStop() {
  const stop = useServerFn(stopAllBots);
  const queries = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function halt() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await stop();
      const text =
        result.stopped === 0
          ? "Todos os bots já estão parados."
          : result.stopped == null
            ? "Parada aplicada aos bots de todas as carteiras."
            : `${result.stopped} bot(s) parado(s) em todas as carteiras.`;
      setMessage(text);
      toast.success(text);
      if (!result.auditRecorded)
        toast.warning("Parada aplicada, mas o resumo de auditoria não foi salvo.");
      window.dispatchEvent(new Event("bots-emergency-stopped"));
      void queries.invalidateQueries();
    } catch {
      const text = "Não foi possível confirmar a parada. Tente novamente.";
      setMessage(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 pb-2.5 sm:px-4">
      <Button
        variant="destructive"
        size="sm"
        className="min-h-11 shrink-0"
        disabled={busy}
        onClick={halt}
      >
        <OctagonX className="mr-2 size-4" aria-hidden="true" />
        {busy ? "Parando todos…" : "Parar todos os bots"}
      </Button>
      <p className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
        Stop forçado em todas as carteiras. Mantém os tokens; transações já enviadas aguardam
        confirmação.
      </p>
      {message && (
        <p role="status" className="w-full text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
