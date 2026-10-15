import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, MoreVertical, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import icon from "@/assets/app-icon.jpg";

export const Route = createFileRoute("/instalar")({
  head: () => ({
    meta: [
      { title: "Instalar o app — CryptoBot" },
      { name: "description", content: "Instale o CryptoBot na tela inicial do seu celular ou computador." },
      { property: "og:title", content: "Instalar o app — CryptoBot" },
      { property: "og:description", content: "Instale o CryptoBot na tela inicial do seu celular ou computador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Instalar,
});

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function Instalar() {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [inFrame, setInFrame] = useState(false);

  useEffect(() => {
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setInFrame(window.self !== window.top);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIP); };
    const done = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", h); window.removeEventListener("appinstalled", done); };
  }, []);

  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    if ((await evt.userChoice).outcome === "accepted") setInstalled(true);
    setEvt(null);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <img src={icon} alt="Ícone do CryptoBot" width={1024} height={1024} className="h-28 w-28 rounded-3xl border border-primary/40 shadow-lg shadow-primary/20" />
          <h1 className="mt-4 text-2xl font-semibold">Instale o CryptoBot</h1>
          <p className="mt-1 text-sm text-muted-foreground">Abra direto pelo ícone na tela inicial, em tela cheia, como um aplicativo.</p>
        </div>

        {installed ? (
          <div className="flex items-center gap-2 rounded-lg border-2 border-primary bg-primary/10 p-4 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-primary" /> ✓ App instalado neste aparelho
          </div>
        ) : evt ? (
          <Button size="lg" className="h-14 w-full text-base" onClick={install}>
            <Download className="mr-2 h-5 w-5" /> Instalar agora
          </Button>
        ) : null}

        {inFrame && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            A instalação funciona no site publicado (criptotrader.lovable.app), aberto direto no navegador.
          </p>
        )}

        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">{ios ? "No iPhone (Safari)" : "No Android (Chrome)"}</h2>
          {ios ? (
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3"><Share className="h-5 w-5 shrink-0 text-primary" /> Toque no botão Compartilhar, embaixo da tela.</li>
              <li className="flex gap-3"><PlusSquare className="h-5 w-5 shrink-0 text-primary" /> Escolha "Adicionar à Tela de Início".</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> Toque em "Adicionar". O ícone aparece na sua tela.</li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3"><MoreVertical className="h-5 w-5 shrink-0 text-primary" /> Toque nos três pontinhos, no canto de cima.</li>
              <li className="flex gap-3"><Download className="h-5 w-5 shrink-0 text-primary" /> Escolha "Instalar app" ou "Adicionar à tela inicial".</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> Confirme. O ícone aparece na sua tela.</li>
            </ol>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">O app precisa de internet para mostrar preços e fazer trocas.</p>
      </div>
    </AppShell>
  );
}
