import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { enablePush } from "@/lib/push";
import { supabase } from "@/integrations/supabase/client";

const KEY = "push-after-install-asked";

/** First time the installed app opens (or right after installing), offers to turn on notifications. */
export function PushAfterInstall() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.self !== window.top || localStorage.getItem(KEY)) return;
    if (!("Notification" in window) || Notification.permission !== "default") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone;
    const show = () => setTimeout(() => setOpen(true), 1500);
    if (standalone) {
      const t = show();
      return () => clearTimeout(t);
    }
    window.addEventListener("appinstalled", show);
    return () => window.removeEventListener("appinstalled", show);
  }, []);

  const done = () => {
    localStorage.setItem(KEY, "1");
    setOpen(false);
  };
  const activate = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        toast.info("Entre na sua conta e ative em Avisos no celular.");
        return done();
      }
      const r = await enablePush();
      if (r.status === "registered") {
        await supabase
          .from("push_devices")
          .upsert({ user_id: data.user.id, token: r.token }, { onConflict: "token" });
        toast.success("Notificações ativadas neste aparelho");
      } else if (r.status === "denied")
        toast.error("Permissão negada. Libere nas configurações do navegador.");
      else
        toast.error("Este aparelho não aceita notificações por aqui. Tente em Avisos no celular.");
      done();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && done()}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
            <Bell className="h-8 w-8 text-primary" />
          </span>
          <DialogTitle>App instalado! Ativar avisos?</DialogTitle>
          <DialogDescription>
            Receba no celular quando o preço chegar perto do seu ponto de compra ou venda e quando o
            robô fizer uma operação.
          </DialogDescription>
        </DialogHeader>
        <Button size="lg" className="h-14 w-full text-base" disabled={busy} onClick={activate}>
          {busy ? "Ativando…" : "Ativar notificações"}
        </Button>
        <Button variant="ghost" onClick={done}>
          Agora não
        </Button>
      </DialogContent>
    </Dialog>
  );
}
