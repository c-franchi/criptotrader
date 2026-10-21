import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { Link, useLocation } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  Download,
  ArrowLeftRight,
  Bot,
  LineChart,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Settings,
  Target,
  Wallet,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";

const nav = [
  { to: "/", label: "Painel", desc: "Preço, liquidez e transferências", icon: LayoutDashboard },
  {
    to: "/alertas",
    label: "Avisos no celular",
    desc: "Aviso quando chegar perto da compra ou venda",
    icon: Bell,
  },
  {
    to: "/metricas",
    label: "Métricas",
    desc: "Evolução em 1h, 12h, 24h e resultado das estratégias",
    icon: LineChart,
  },
  { to: "/estrategia", label: "Estratégia", desc: "Regras de compra, venda e risco", icon: Target },
  { to: "/simulacao", label: "Simulação", desc: "Treine sem dinheiro real", icon: FlaskConical },
  { to: "/operar", label: "Operar", desc: "Trade real com sua carteira", icon: ArrowLeftRight },
  {
    to: "/grade",
    label: "Robô automático",
    desc: "Compra e vende sozinho seguindo sua estratégia",
    icon: Bot,
  },
  { to: "/carteiras", label: "Minhas carteiras", desc: "Endereços salvos e perfil", icon: Wallet },
  { to: "/integracoes", label: "Integrações", desc: "Fontes de dados e status", icon: Settings },
  {
    to: "/instalar",
    label: "Instalar o app",
    desc: "Ícone na tela inicial do celular",
    icon: Download,
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const current = nav.find((n) => n.to === pathname);
  return (
    <div className="min-h-screen pb-20 lg:pb-0 lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <Link
          to="/"
          className="border-b border-border px-5 py-6 font-mono text-lg font-semibold tracking-wider text-primary"
        >
          CRYPTO·BOT
        </Link>
        <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav
            .filter(
              (n) =>
                n.to !== "/integracoes" || user?.email?.toLowerCase() === "neifranchi@gmail.com",
            )
            .map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-primary/10 text-primary font-semibold" }}
                activeOptions={{ exact: true }}
              >
                <n.icon className="h-5 w-5 shrink-0" />
                {n.label}
              </Link>
            ))}
        </nav>
        <p className="truncate border-t border-border p-4 text-xs text-muted-foreground">
          {user?.email ?? "Mercado público · entre para salvar"}
        </p>
      </aside>
      <nav
        aria-label="Atalhos no celular"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {nav
          .filter((n) => ["/", "/estrategia", "/simulacao", "/grade"].includes(n.to))
          .map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground"
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: true }}
            >
              <n.icon className="h-5 w-5" />
              {n.to === "/grade" ? "Robô" : n.label}
            </Link>
          ))}
      </nav>
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
              <SheetHeader className="border-b border-border px-4 py-4 text-left">
                <SheetTitle className="font-mono text-sm tracking-wider text-primary">
                  CRYPTO·BOT
                </SheetTitle>
                {user && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-2">
                {nav
                  .filter(
                    (n) =>
                      n.to !== "/integracoes" ||
                      user?.email?.toLowerCase() === "neifranchi@gmail.com",
                  )
                  .map((n) => (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      activeProps={{ className: "bg-secondary text-foreground" }}
                      activeOptions={{ exact: true }}
                    >
                      <n.icon className="h-5 w-5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{n.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {n.desc}
                        </span>
                      </span>
                    </Link>
                  ))}
              </nav>
              <div className="border-t border-border p-3">
                {user ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      setOpen(false);
                      await supabase.auth.signOut();
                      window.location.replace("/");
                    }}
                  >
                    Sair da conta
                  </Button>
                ) : (
                  <Button className="w-full" asChild>
                    <Link to="/login" onClick={() => setOpen(false)}>
                      Entrar
                    </Link>
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
          <Link
            to="/"
            className="shrink-0 font-mono text-sm font-semibold tracking-wider text-primary"
          >
            CRYPTO·BOT
          </Link>
          {current && (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              / {current.label}
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center">
            <AppUpdateNotice />
            <NotificationBell />
            {!user && (
              <Button size="sm" asChild>
                <Link to="/login">Entrar</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}

export function Panel({
  title,
  children,
  right,
  collapsible,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  if (collapsible)
    return (
      <details
        open={defaultOpen}
        onToggle={(e) => {
          const el = e.currentTarget;
          if (el.dataset["userToggle"] !== "1") return;
          el.dataset["userToggle"] = "";
          requestAnimationFrame(() =>
            el.scrollIntoView({ behavior: "smooth", block: el.open ? "start" : "center" }),
          );
        }}
        className="group min-w-0 scroll-mt-16 rounded-lg border border-border bg-card p-3 sm:p-4"
      >
        <summary
          onClick={(e) => {
            (e.currentTarget.parentElement as HTMLElement).dataset["userToggle"] = "1";
          }}
          className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
        >
          <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </h2>
          <span className="flex items-center gap-2">
            {right && <span onClick={(e) => e.stopPropagation()}>{right}</span>}
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="mt-3">{children}</div>
      </details>
    );
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
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
