import { useEffect, useState } from "react";
import { Download, Share, PlusSquare } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getInstallState, runInstall, subscribeInstall } from "@/lib/installPrompt";
import icon from "@/assets/app-icon.jpg";

const KEY = "install-popup-dismissed";
const WAIT_DAYS = 3;

export function InstallPopup() {
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (window.self !== window.top) return;
    const last = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - last < WAIT_DAYS * 86_400_000) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone) return;
    setIos(isIos);
    const check = () => {
      const s = getInstallState();
      if (s.installed) setOpen(false);
      else if (s.canInstall) setOpen(true);
    };
    const t = setTimeout(() => { if (isIos) setOpen(true); else check(); }, 2500);
    const un = subscribeInstall(check);
    return () => { clearTimeout(t); un(); };
  }, []);

  const later = () => { localStorage.setItem(KEY, String(Date.now())); setOpen(false); };
  const install = async () => { await runInstall(); setOpen(false); };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : later())}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <img src={icon} alt="Ícone do CryptoBot" width={96} height={96} className="h-20 w-20 rounded-2xl border border-primary/40" />
          <DialogTitle>Instalar o CryptoBot</DialogTitle>
          <DialogDescription>
            {ios ? "O iPhone não deixa sites instalarem sozinhos. São só 2 toques:" : "Coloque o ícone na sua tela inicial e abra como um aplicativo."}
          </DialogDescription>
        </DialogHeader>
        {ios ? (
          <ol className="space-y-2 text-sm">
            <li className="flex gap-2"><Share className="h-5 w-5 text-primary" /> Toque em Compartilhar, embaixo da tela.</li>
            <li className="flex gap-2"><PlusSquare className="h-5 w-5 text-primary" /> Toque em "Adicionar à Tela de Início".</li>
          </ol>
        ) : (
          <Button size="lg" className="h-14 w-full text-base" onClick={install}>
            <Download className="mr-2 h-5 w-5" /> Instalar agora
          </Button>
        )}
        <Button variant="ghost" onClick={later}>Agora não</Button>
      </DialogContent>
    </Dialog>
  );
}
