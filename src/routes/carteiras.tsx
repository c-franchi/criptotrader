import { WalletSelector } from "@/components/WalletSelector";
import { FundsOverview } from "@/components/FundsOverview";
import { PageHeading } from "@/components/PageHeading";
import { BotPerformancePanel } from "@/components/BotPerformancePanel";
import { FiatValue } from "@/hooks/useCurrency";
import { useSelectedWallet } from "@/hooks/useSelectedWallet";
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
      {
        name: "description",
        content:
          "Salve os endereços das suas carteiras BSC e selecione-os rapidamente em qualquer função.",
      },
      { property: "og:title", content: "Minhas carteiras — CryptoBot" },
      {
        property: "og:description",
        content:
          "Salve os endereços das suas carteiras BSC e selecione-os rapidamente em qualquer função.",
      },
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
  const { selectWallet } = useSelectedWallet();
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
      <PageHeading title="Carteiras" description="Endereços, saldos e ativos em um só lugar." />
      <FundsOverview />
      <Panel title="Perfil">
        <p className="text-sm">
          Conta: <strong>{user?.email}</strong>
        </p>
      </Panel>

      <details className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Gerenciar carteiras dos robôs
        </summary>
        <div className="mt-4">
          <WalletSelector />
          <BotWallet />
        </div>
      </details>

      <div id="adicionar-carteira" className="scroll-mt-24" />
      <Panel title="Adicionar carteira">
        <div className="space-y-3">
          <div>
            <Label>Nome (opcional)</Label>
            <Input
              placeholder="Ex.: Principal, Trust Wallet…"
              value={label}
              maxLength={40}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <Label>Endereço</Label>
            <Input
              placeholder="0x…"
              value={address}
              onChange={(e) => setAddress(e.target.value.trim())}
            />
          </div>
          <Button className="w-full sm:w-auto" onClick={submit} disabled={busy}>
            Salvar carteira
          </Button>
          <p className="text-xs text-muted-foreground">
            Salve só o endereço público. Nunca digite aqui sua frase de recuperação ou chave
            privada.
          </p>
        </div>
      </Panel>

      <Panel title={`Carteiras salvas (${wallets.length})`}>
        {wallets.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma carteira salva ainda.</p>
        )}
        <ul className="space-y-3">
          {wallets.map((w) => (
            <li key={w.id} className="rounded border border-border p-3">
              <Input
                className="mb-2"
                defaultValue={w.label}
                placeholder="Sem nome"
                maxLength={40}
                onBlur={(e) => e.target.value !== w.label && rename(w.id, e.target.value)}
              />
              <p className="break-all font-mono text-xs text-muted-foreground">{w.address}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link to="/grade" onClick={() => selectWallet(w.id)}>
                    Abrir robôs desta carteira
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(w.address);
                    toast.success("Endereço copiado");
                  }}
                >
                  Copiar
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a
                    href={`https://bscscan.com/address/${w.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    BscScan
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={() => remove(w.id).catch((e) => toast.error((e as Error).message))}
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/** Shows the robot's own wallet, clearly separated from the user's personal wallets. */
function BotWallet() {
  const { walletScope, name } = useSelectedWallet();
  const getW = useServerFn(getBotWallet);
  const [w, setW] = useState<Awaited<ReturnType<typeof getBotWallet>> | null>(null);
  useEffect(() => {
    void getW({ data: { walletScope } })
      .then(setW)
      .catch(() => setW({ address: null, bnb: null, tokens: [] }));
  }, [getW, walletScope]);

  const bnb = w?.bnb === null || w?.bnb === undefined ? null : Number(w.bnb);
  const held = (w?.tokens ?? []).filter((t) => Number(t.amount) > 0);

  return (
    <Panel title={`Carteira automática · ${name}`}>
      {w === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : w.address ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="text-base">
              🤖
            </span>
            <p className="min-w-0 text-sm font-semibold text-primary">
              Carteira do robô automático
            </p>
            <span className="ml-auto rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Não é sua carteira pessoal
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-xs">{w.address}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(w.address!);
                toast.success("Endereço copiado");
              }}
            >
              Copiar
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={`https://bscscan.com/address/${w.address}`} target="_blank" rel="noreferrer">
                BscScan
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/grade">Abrir o robô</Link>
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            BNB no robô:{" "}
            {bnb === null ? (
              "indisponível agora"
            ) : (
              <span className="font-mono">
                {bnb.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}
              </span>
            )}
            {held.length > 0 && (
              <>
                {" "}
                ·{" "}
                {held
                  .map(
                    (t) =>
                      `${t.symbol}: ${Number(t.amount).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`,
                  )
                  .join(" · ")}
              </>
            )}
            {bnb !== null && <FiatValue bnb={bnb} />}
          </p>
          {held.length > 0 && (
            <section aria-label="Resultado dos ativos mantidos" className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold">Ativos mantidos · compras do robô</h3>
              <p className="text-xs text-muted-foreground">
                Finalizar a automação mantém as moedas e seu custo registrado. A valorização ou
                desvalorização aparece como resultado em aberto; lucro realizado exige venda
                confirmada.
              </p>
              {held.map((asset) => (
                <div key={asset.address}>
                  <p className="text-sm font-semibold">
                    {asset.symbol} ·{" "}
                    {Number(asset.amount).toLocaleString("pt-BR", { maximumSignificantDigits: 8 })}
                  </p>
                  <BotPerformancePanel walletScope={walletScope} token={asset.address} />
                </div>
              ))}
            </section>
          )}
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>
              🔒 O robô compra e vende só com o que está nesta carteira. Ela não mexe na sua
              carteira pessoal.
            </li>
            <li>
              🔒 A chave desta carteira fica guardada criptografada no servidor e nunca é mostrada.
            </li>
            <li>
              💡 Para pegar o dinheiro de volta, use{" "}
              <strong className="text-foreground">"Devolver ativos à carteira mãe"</strong> na
              página do robô.
            </li>
            <li>Esta carteira não entra na lista de baixo e não pode ser apagada daqui.</li>
          </ul>
        </div>
      ) : (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="text-muted-foreground">
            Você ainda não tem carteira do robô. Ela é criada com um toque, na página do robô.
          </p>
          <Button size="sm" variant="outline" className="mt-2" asChild>
            <Link to="/grade">Criar carteira do robô</Link>
          </Button>
        </div>
      )}
    </Panel>
  );
}
