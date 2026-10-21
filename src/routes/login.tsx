import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import icon from "@/assets/app-icon.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — CryptoBot" },
      {
        name: "description",
        content: "Acesse sua conta para salvar estratégias e simulações de tokens.",
      },
      { property: "og:title", content: "Entrar — CryptoBot" },
      {
        property: "og:description",
        content: "Acesse sua conta para salvar estratégias e simulações de tokens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (recovering) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Senha atualizada");
        setRecovering(false);
        nav({ to: "/" });
        return;
      }
      if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
        toast.success("Se houver uma conta para este e-mail, você receberá o link de recuperação.");
        return;
      }
      const { data, error } = signup
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (signup && !data.session) {
        toast.success("Confira seu e-mail para confirmar a conta.");
        return;
      }
      nav({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (r.error) return void toast.error("Falha no login com Google");
    if (r.redirected) return;
    nav({ to: "/" });
  };

  return (
    <AppShell>
      <div className="relative mx-auto max-w-sm">
        <div className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex flex-col items-center text-center">
          <img
            src={icon}
            alt="CryptoBot"
            width={1024}
            height={1024}
            className="h-20 w-20 rounded-2xl border border-primary/40 shadow-lg shadow-primary/20"
          />
          <h1 className="mt-4 text-2xl font-semibold">
            {recovering
              ? "Definir nova senha"
              : forgot
                ? "Recuperar acesso"
                : signup
                  ? "Crie sua conta"
                  : "Bem-vindo de volta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {signup
              ? "Leva menos de um minuto."
              : "Entre para acessar suas estratégias e operações."}
          </p>
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card/80 p-6 shadow-xl backdrop-blur">
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={busy || recovering}
            onClick={google}
          >
            Continuar com Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> ou com e-mail{" "}
            <div className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            {!recovering && (
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  className="h-11"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            {!forgot && (
              <div className="space-y-1.5">
                <Label htmlFor="pw">Senha</Label>
                <Input
                  id="pw"
                  type={showPassword ? "text" : "password"}
                  className="h-11"
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-pressed={showPassword}
                  className="py-2 text-xs text-primary"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Ocultar senha" : "Mostrar senha"}
                </button>
              </div>
            )}
            <Button className="h-11 w-full text-base" disabled={busy}>
              {busy
                ? "Aguarde..."
                : recovering
                  ? "Salvar nova senha"
                  : forgot
                    ? "Enviar link de recuperação"
                    : signup
                      ? "Criar conta"
                      : "Entrar"}
            </Button>
          </form>
          {!recovering && (
            <button
              type="button"
              className="mt-3 w-full py-2 text-sm text-primary"
              onClick={() => {
                setForgot((v) => !v);
                setSignup(false);
              }}
            >
              {forgot ? "Voltar ao login" : "Esqueci minha senha"}
            </button>
          )}
          <button
            className="mt-5 w-full text-sm text-muted-foreground hover:text-foreground"
            disabled={recovering || busy}
            onClick={() => {
              setSignup(!signup);
              setForgot(false);
            }}
          >
            {signup ? "Já tem conta? " : "Ainda não tem conta? "}
            <span className="font-medium text-primary underline">
              {signup ? "Entrar" : "Criar agora"}
            </span>
          </button>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Nunca pediremos sua frase de recuperação
          ou chave privada.
        </p>
      </div>
    </AppShell>
  );
}
