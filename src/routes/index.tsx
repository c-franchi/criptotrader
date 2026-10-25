import { FundsOverview } from "@/components/FundsOverview";
import { AppShell, RequireLogin } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import { MarketDashboard } from "@/components/MarketDashboard";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de mercado — CryptoBot" },
      { name: "description", content: "Cotações, gráficos e liquidez dos seus tokens na BSC, com suas carteiras e fundos." },
      { property: "og:title", content: "Painel de mercado — CryptoBot" },
      { property: "og:description", content: "Acompanhe o mercado dos seus tokens na BSC e consulte suas carteiras no CryptoBot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <MarketDashboard />
      <RequireLogin>
        <FundsOverview />
      </RequireLogin>
    </AppShell>
  ),
});
