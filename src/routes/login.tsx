import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — GTE Monitor" },
      { name: "description", content: "Acesse sua conta para salvar estratégias e simulações do GTE." },
      { property: "og:title", content: "Entrar — GTE Monitor" },
      { property: "og:description", content: "Acesse sua conta para salvar estratégias e simulações do GTE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = signup
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return void toast.error(error.message);
    if (signup && !data.session) return void toast.success("Confira seu e-mail para confirmar a conta.");
    nav({ to: "/" });
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) return void toast.error("Falha no login com Google");
    if (r.redirected) return;
    nav({ to: "/" });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-sm rounded-lg border border-border bg-card p-6">
        <h1 className="mb-4 text-xl font-semibold">{signup ? "Criar conta" : "Entrar"}</h1>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pw">Senha</Label>
            <Input id="pw" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy}>
            {signup ? "Criar conta" : "Entrar"}
          </Button>
        </form>
        <Button variant="outline" className="mt-3 w-full" onClick={google}>
          Continuar com Google
        </Button>
        <button className="mt-4 w-full text-sm text-muted-foreground underline" onClick={() => setSignup(!signup)}>
          {signup ? "Já tenho conta" : "Criar uma conta"}
        </button>
        <p className="mt-4 text-xs text-muted-foreground">Nunca pediremos sua seed phrase ou chave privada.</p>
      </div>
    </AppShell>
  );
}
