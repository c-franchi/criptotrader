import { FundsOverview } from "@/components/FundsOverview";
import { AppShell, RequireLogin } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import { MarketDashboard } from "@/components/MarketDashboard";
import { UxActionTile, UxDetailDialog } from "@/components/UxDetailDialog";
import { Wallet } from "lucide-react";
import { useState } from "react";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de mercado — CryptoBot" },
      {
        name: "description",
        content:
          "Cotações, gráficos e liquidez dos seus tokens na BSC, com suas carteiras e fundos.",
      },
      { property: "og:title", content: "Painel de mercado — CryptoBot" },
      {
        property: "og:description",
        content:
          "Acompanhe o mercado dos seus tokens na BSC e consulte suas carteiras no CryptoBot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <MarketDashboard />
      <RequireLogin>
        <DashboardWalletDetails />
      </RequireLogin>
    </AppShell>
  ),
});

function DashboardWalletDetails() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-6xl">
      <UxActionTile
        label="Carteiras e saldos"
        description="Consulte seus ativos e os fundos dos robôs"
        icon={Wallet}
        onClick={() => setOpen(true)}
      />
      <UxDetailDialog open={open} onOpenChange={setOpen} title="Carteiras e saldos" icon={Wallet}>
        <FundsOverview />
      </UxDetailDialog>
    </div>
  );
}
