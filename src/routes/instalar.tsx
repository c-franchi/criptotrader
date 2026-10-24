import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { InstallApp } from "@/components/InstallApp";

export const Route = createFileRoute("/instalar")({
  head: () => ({
    meta: [
      { title: "Instalar o app — CryptoBot" },
      {
        name: "description",
        content: "Instale o CryptoBot na tela inicial do seu celular ou computador.",
      },
      { property: "og:title", content: "Instalar o app — CryptoBot" },
      {
        property: "og:description",
        content: "Instale o CryptoBot na tela inicial do seu celular ou computador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Instalar,
});

function Instalar() {
  return (
    <AppShell>
      <InstallApp />
    </AppShell>
  );
}
