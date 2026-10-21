import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações — CryptoBot" },
      { name: "description", content: "Estado das integrações: RPC BSC, DexScreener, carteira, executor e automação." },
      { property: "og:title", content: "Integrações — CryptoBot" },
      { property: "og:description", content: "Estado das integrações: RPC BSC, DexScreener, carteira, executor e automação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Integrations,
});

const items: { name: string; status: "ok" | "falta" | "futuro"; text: string }[] = [
  { name: "RPC da BSC", status: "ok", text: "RPC público da BNB Chain (bsc-dataseed). Pode ser substituído pelo segredo BSC_RPC_URL. Limites de uso não garantidos; usa timeout de 8s e 3 tentativas com backoff." },
  { name: "Mercado (DexScreener)", status: "ok", text: "API pública gratuita (cerca de 300 req/min). Usada para descobrir pools, preço, liquidez e volume. Atualização a cada 30s." },
  { name: "Login e banco de dados", status: "ok", text: "Lovable Cloud com isolamento por usuário: cada conta só acessa sua própria estratégia e simulações." },
  { name: "WalletConnect", status: "ok", text: "Project ID configurado. Usado para conectar a carteira e solicitar assinaturas na página Operar." },
  { name: "API Etherscan V2 / BscScan", status: "falta", text: "Opcional. A disponibilidade da BSC no plano gratuito precisa ser confirmada; sem chave, holders e transferências ficam indisponíveis." },
  { name: "Operação com confirmação (PancakeSwap)", status: "ok", text: "Ativo: cotação no router oficial, minimum amount out, aprovação limitada e assinatura na carteira a cada operação." },
  { name: "Automação em segundo plano", status: "futuro", text: "Fase 3: exige carteira com permissões de sessão limitadas ou executor dedicado com assinatura segura. Indisponível até lá." },
];

function Integrations() {
  const { user, loading } = useAuth();
  if (loading) return <AppShell><p className="text-sm text-muted-foreground">Carregando…</p></AppShell>;
  if (user?.email?.toLowerCase() !== "neifranchi@gmail.com") return <AppShell><p className="text-sm text-muted-foreground">Página não disponível.</p></AppShell>;
  return (
    <AppShell>
      <h1 className="mb-4 text-2xl font-semibold">Integrações</h1>
      <div className="space-y-3">
        {items.map((i) => (
          <Panel key={i.name} title={i.name} right={
            <span className={i.status === "ok" ? "text-xs text-success" : i.status === "falta" ? "text-xs text-warning" : "text-xs text-muted-foreground"}>
              {i.status === "ok" ? "ativo" : i.status === "falta" ? "pendente" : "fase futura"}
            </span>
          }>
            <p className="text-sm text-muted-foreground">{i.text}</p>
          </Panel>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Nenhum segredo é exibido. Nunca informe seed phrase ou chave privada.</p>
    </AppShell>
  );
}
