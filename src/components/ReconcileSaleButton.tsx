import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reconcileOrderAccounting } from "@/lib/audit.functions";
import { Button } from "./ui/button";
export function ReconcileSaleButton({
  hash,
  auto = false,
  onUpdated,
}: {
  hash: string;
  auto?: boolean;
  onUpdated?: (() => void) | undefined;
}) {
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const { mutate, isPending } = useMutation({
    mutationFn: (hash: string) => reconcileOrderAccounting({ data: { hash } }),
    onSuccess: async (result) => {
      setMessage(result.message);
      if (result.confirmed) {
        await client.invalidateQueries({ queryKey: ["bot-performance"] });
        await client.invalidateQueries({ queryKey: ["robot-chart-orders"] });
        onUpdated?.();
      }
    },
    onError: () => setMessage("Não foi possível consultar o recebimento agora. Tente novamente."),
  });
  useEffect(() => {
    if (auto) mutate(hash);
  }, [auto, hash, mutate]);
  return (
    <div className="mt-2 space-y-1">
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => mutate(hash)}>
        {isPending ? "Consultando recebimento…" : "Conferir BNB recebido"}
      </Button>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
