import { FundsOverview } from "@/components/FundsOverview";
import { AppShell, RequireLogin } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CryptoBot · Carteiras" },
      { name: "description", content: "Suas carteiras, tokens e fundos em um só lugar." },
    ],
  }),
  component: () => (
    <AppShell>
      <RequireLogin>
        <FundsOverview />
      </RequireLogin>
    </AppShell>
  ),
});
