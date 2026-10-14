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
  { to: "/integracoes", label: "Integrações" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="font-mono text-sm font-semibold tracking-wider text-primary">
            GTE·MONITOR
          </Link>
          <span className="rounded border border-primary/40 bg-accent px-2 py-0.5 font-mono text-[10px] font-bold text-accent-foreground">
            SIMULAÇÃO / CONFIRMAÇÃO
          </span>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:ml-4 sm:w-auto">
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
          <div className="ml-auto">
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
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Unavailable({ reason }: { reason: string }) {
  return (
    <span className="text-sm text-muted-foreground">
      indisponível <span className="text-xs">({reason})</span>
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
