import { PageHeading } from "@/components/PageHeading";
import { useQuery } from "@tanstack/react-query";
import { getIntegrationHealth } from "@/lib/health.functions";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { UxActionTile, UxDetailDialog } from "@/components/UxDetailDialog";
import { Activity } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações — CryptoBot" },
      {
        name: "description",
        content: "Estado das integrações: RPC BSC, DexScreener, carteira, executor e automação.",
      },
      { property: "og:title", content: "Integrações — CryptoBot" },
      {
        property: "og:description",
        content: "Estado das integrações: RPC BSC, DexScreener, carteira, executor e automação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Integrations,
});

function Integrations() {
  const [selected, setSelected] = useState<string | null>(null);
  const { user, loading } = useAuth();
  const health = useQuery({
    queryKey: ["integration-health", user?.id],
    queryFn: () => getIntegrationHealth(),
    enabled: user?.email?.toLowerCase() === "neifranchi@gmail.com",
    staleTime: 30000,
  });
  if (loading)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </AppShell>
    );
  if (user?.email?.toLowerCase() !== "neifranchi@gmail.com")
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Página não disponível.</p>
      </AppShell>
    );
  return (
    <AppShell>
      <PageHeading title="Integrações" description="Conexões e disponibilidade dos serviços." />
      <Button
        variant="outline"
        size="sm"
        disabled={health.isFetching}
        onClick={() => health.refetch()}
      >
        Atualizar verificações
      </Button>
      <p role="status" className="my-3 text-xs text-muted-foreground">
        {health.isPending
          ? "Consultando integrações…"
          : health.isError
            ? "Não foi possível consultar as integrações agora."
            : `Verificado às ${new Date(health.dataUpdatedAt).toLocaleTimeString("pt-BR")}`}
      </p>
      <div className="space-y-3">
        <div className="ux-summary-card text-sm">
          <p className="font-semibold">Resumo das integrações</p>
          <div className="ux-summary-list mt-2">
            <div>
              <span>Verificadas</span>
              <strong className="text-success">
                {(health.data ?? []).filter((i) => i.ok === true).length}
              </strong>
            </div>
            <div>
              <span>Precisam de atenção</span>
              <strong className="text-warning">
                {(health.data ?? []).filter((i) => i.ok === false).length}
              </strong>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(health.data ?? []).map((i) => (
            <div key={i.name}>
              <UxActionTile
                label={i.name}
                icon={Activity}
                description={
                  i.ok === true
                    ? "Verificado"
                    : i.ok === false
                      ? "Precisa de atenção"
                      : "Ainda sem atividade"
                }
                onClick={() => setSelected(i.name)}
              />
              <UxDetailDialog
                title={i.name}
                icon={Activity}
                open={selected === i.name}
                onOpenChange={(open) => setSelected(open ? i.name : null)}
              >
                <p className="text-sm text-muted-foreground">{i.text}</p>
                <p className={i.ok ? "text-sm text-success" : "text-sm text-warning"}>
                  {i.ok === true
                    ? "Verificado"
                    : i.ok === false
                      ? "Precisa de atenção"
                      : "Não comprovado"}
                </p>
              </UxDetailDialog>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Nenhum segredo é exibido. Nunca informe seed phrase ou chave privada.
      </p>
    </AppShell>
  );
}
