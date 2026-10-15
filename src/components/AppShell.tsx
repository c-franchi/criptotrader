import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Painel" },
  { to: "/estrategia", label: "Estratégia" },
  { to: "/simulacao", label: "Simulação" },
  { to: "/operar", label: "Operar" },
  { to: "/grade", label: "Grade" },
  { to: "/integracoes", label: "Integrações" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="shrink-0 font-mono text-sm font-semibold tracking-wider text-primary">
            GTE·MONITOR
          </Link>
          <span className="hidden rounded border border-primary/40 bg-accent px-2 py-0.5 font-mono text-[10px] font-bold text-accent-foreground lg:inline">
            SIMULAÇÃO / CONFIRMAÇÃO
          </span>
          <nav className="hidden gap-1 sm:ml-4 sm:flex">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="whitespace-nowrap rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
                activeOptions={{ exact: true }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto shrink-0">
            {user ? (
              <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>
                Sair
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link to="/login">Entrar</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-background/95 backdrop-blur sm:hidden">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="truncate px-0.5 py-3 text-center text-[11px] text-muted-foreground"
            activeProps={{ className: "font-semibold text-primary" }}
            activeOptions={{ exact: true }}
          >
            {n.label === "Integrações" ? "Config." : n.label === "Estratégia" ? "Estrat." : n.label === "Simulação" ? "Simular" : n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Unavailable({ reason }: { reason: string }) {
  return (
    <span className="text-sm text-muted-foreground" title={reason}>
      indisponível <span className="hidden text-xs sm:inline">({reason})</span>
    </span>
  );
}

export function RequireLogin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="text-muted-foreground">Carregando…</p>;
  if (!user)
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="mb-4">Entre na sua conta para salvar estratégia e simulações.</p>
        <Button asChild>
          <Link to="/login">Entrar</Link>
        </Button>
      </div>
    );
  return <>{children}</>;
}
