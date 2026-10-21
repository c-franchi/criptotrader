import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { APP_BUILD_ID } from "@/lib/appVersion";
import { Button } from "@/components/ui/button";

/** Works in browser and standalone PWA. Never reload a form/transaction automatically. */
export function AppUpdateNotice() {
  const [latest, setLatest] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const check = useCallback(async (manual = false) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/public/app-version?t=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("version unavailable");
      const data = await response.json();
      if (typeof data.version !== "string" || !data.version || data.version.length > 100)
        throw new Error("invalid version");
      setLatest(data.version === APP_BUILD_ID ? null : data.version);
      if (manual)
        setMessage(
          data.version === APP_BUILD_ID
            ? "Você já está na versão mais recente."
            : "Nova versão disponível.",
        );
    } catch {
      if (manual) setMessage("Não foi possível verificar. Confira sua conexão e tente novamente.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void check();
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const online = () => void check();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 300000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", online);
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", online);
      window.removeEventListener("online", online);
    };
  }, [check]);
  const reload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("_app_version", latest ?? APP_BUILD_ID);
    window.location.replace(url.toString());
  };
  return (
    <div className="text-xs">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void check(true)}
        disabled={busy}
        title={`Versão ${APP_BUILD_ID}`}
        aria-label="Verificar atualização do app"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "motion-safe:animate-spin" : ""}`} />
        <span className="ml-1 hidden sm:inline">Atualizar app</span>
      </Button>
      {message && !latest && (
        <p
          role="status"
          className="fixed inset-x-4 bottom-24 z-40 rounded-lg border border-border bg-card p-3 shadow-lg sm:left-auto sm:max-w-sm"
        >
          {message}
          <button className="ml-3 underline" onClick={() => setMessage("")}>
            Fechar
          </button>
        </p>
      )}
      {latest && (
        <section
          role="status"
          aria-label="Atualização disponível"
          className="fixed inset-x-4 bottom-24 z-40 rounded-lg border border-primary/50 bg-card p-4 shadow-lg sm:left-auto sm:max-w-md"
        >
          <p className="font-semibold">Nova versão disponível</p>
          <p className="mt-1 text-muted-foreground">
            Salve suas alterações e atualize para receber as melhorias.
          </p>
          <Button size="sm" className="mt-3" onClick={reload}>
            Atualizar agora
          </Button>
        </section>
      )}
    </div>
  );
}
