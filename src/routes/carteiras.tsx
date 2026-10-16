import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, Panel, RequireLogin } from "@/components/AppShell";
import { useSavedWallets } from "@/hooks/useSavedWallets";
import { useAuth } from "@/hooks/useAuth";
import { getBotWallet } from "@/lib/bot.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/carteiras")({
  head: () => ({
    meta: [
      { title: "Minhas carteiras — CryptoBot" },
      { name: "description", content: "Salve os endereços das suas carteiras BSC e selecione-os rapidamente em qualquer função." },
      { property: "og:title", content: "Minhas carteiras — CryptoBot" },
      { property: "og:description", content: "Salve os endereços das suas carteiras BSC e selecione-os rapidamente em qualquer função." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequireLogin>
        <Wallets />
      </RequireLogin>
    </AppShell>
  ),
});

function Wallets() {
  const { user } = useAuth();
  const { wallets, add, rename, remove } = useSavedWallets();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const err = await add(address, label);
    setBusy(false);
    if (err) return void toast.error(err);
    toast.success("Carteira salva");
    setAddress("");
    setLabel("");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Panel title="Perfil">
        <p className="text-sm">Conta: <strong>{user?.email}</strong></p>
      </Panel>

      <BotWallet />

      <Panel title="Adicionar carteira">
        <div className="space-y-3">
          <div>
            <Label>Nome (opcional)</Label>
            <Input placeholder="Ex.: Principal, Trust Wallet…" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label>Endereço</Label>
            <Input placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value.trim())} />
          </div>
          <Button className="w-full sm:w-auto" onClick={submit} disabled={busy}>Salvar carteira</Button>
          <p className="text-xs text-muted-foreground">Salve só o endereço público. Nunca digite aqui sua frase de recuperação ou chave privada.</p>
        </div>
      </Panel>

      <Panel title={`Carteiras salvas (${wallets.length})`}>
        {wallets.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma carteira salva ainda.</p>}
        <ul className="space-y-3">
          {wallets.map((w) => (
            <li key={w.id} className="rounded border border-border p-3">
              <Input className="mb-2" defaultValue={w.label} placeholder="Sem nome" maxLength={40} onBlur={(e) => e.target.value !== w.label && rename(w.id, e.target.value)} />
              <p className="break-all font-mono text-xs text-muted-foreground">{w.address}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(w.address); toast.success("Endereço copiado"); }}>Copiar</Button>
                <Button size="sm" variant="ghost" asChild><a href={`https://bscscan.com/address/${w.address}`} target="_blank" rel="noreferrer">BscScan</a></Button>
                <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => remove(w.id)}>Remover</Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
