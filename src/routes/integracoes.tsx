import { PageHeading } from "@/components/PageHeading";
import { useQuery } from "@tanstack/react-query";
import { getIntegrationHealth } from "@/lib/health.functions";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/AppShell";
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
        {(health.data ?? []).map((i) => (
          <Panel
            key={i.name}
            title={i.name}
            right={
              <span
                className={
                  i.ok === true
                    ? "text-xs text-success"
                    : i.ok === false
                      ? "text-xs text-warning"
                      : "text-xs text-muted-foreground"
                }
              >
                {i.ok === true ? "verificado" : i.ok === false ? "atenção" : "sem atividade"}
              </span>
            }
          >
            <p className="text-sm text-muted-foreground">{i.text}</p>
          </Panel>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Nenhum segredo é exibido. Nunca informe seed phrase ou chave privada.
      </p>
    </AppShell>
  );
}
