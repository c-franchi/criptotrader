import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { findToken, TOKENS } from "@/lib/tokens";
import { inspectToken, scanWallet, type WalletToken } from "@/lib/userTokens.functions";
import { WalletPicker } from "@/components/WalletPicker";
import { Button } from "@/components/ui/button";
import { ContractRisk } from "@/components/ContractRisk";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);
const fmt = (v: string) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 6 });

export function AddTokenDialog({ wallet: initialWallet }: { wallet?: string | null }) {
  const { walletScope, address: selectedAddress } = useSelectedWallet();
  const { tokens, addToken, removeToken, selectToken } = useSelectedToken();
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState(initialWallet ?? "");
  const [found, setFound] = useState<WalletToken[] | null>(null);
  const [bnb, setBnb] = useState<string | null>(null);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || wallet) return;
    if (initialWallet || selectedAddress)
      return void setWallet(initialWallet ?? selectedAddress ?? "");
    supabase
      .from("strategies")
      .select("tracked_wallet")
      .eq("wallet_scope", walletScope)
      .not("tracked_wallet", "is", null)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.tracked_wallet) setWallet(data.tracked_wallet);
      });
  }, [open, wallet, initialWallet, selectedAddress, walletScope]);

  const add = async (t: {
    address: `0x${string}`;
    symbol: string;
    name: string;
    decimals: number;
  }) => {
    const err = await addToken({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
    });
    if (err) return void toast.error(err);
    toast.success(`${t.symbol} adicionado`);
  };

  const scan = async () => {
    if (!isAddr(wallet)) return void toast.error("Endereço de carteira inválido");
    setBusy("scan");
    try {
      const extra = tokens.filter((t) => !TOKENS.includes(t)).map((t) => t.address);
      const r = await scanWallet({ data: { wallet, extra } });
      setFound(r.tokens);
      setBnb(r.bnb);
    } catch {
      toast.error("Não foi possível ler a carteira agora. Tente de novo.");
    }
    setBusy(null);
  };

  const byAddress = async () => {
    if (!isAddr(addr)) return void toast.error("Endereço de token inválido");
    setBusy("addr");
    const r = await inspectToken({ data: { address: addr } }).catch(() => null);
    setBusy(null);
    if (!r?.token) return void toast.error(r?.error ?? "Não foi possível verificar o token");
    await add(r.token);
    selectToken(r.token.address);
    setAddr("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          + Token
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tokens da carteira</DialogTitle>
          <DialogDescription>
            Leia o saldo de uma carteira ou cole o endereço de qualquer token da BSC.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Carteira</Label>
          <div className="flex gap-2">
            <Input
              placeholder="0x…"
              value={wallet}
              onChange={(e) => setWallet(e.target.value.trim())}
            />
            <Button onClick={scan} disabled={busy === "scan"}>
              {busy === "scan" ? "Lendo…" : "Buscar"}
            </Button>
          </div>
          <WalletPicker
            value={wallet}
            onPick={(a) => {
              setWallet(a);
              setFound(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            A busca confere os tokens mais comuns da BSC e os que você já adicionou. Tokens menos
            conhecidos não aparecem sozinhos — adicione pelo endereço abaixo.
          </p>
          {found && (
            <div className="space-y-1 rounded border border-border p-2">
              {bnb !== null && (
                <p className="text-sm">
                  BNB: <strong>{fmt(bnb)}</strong>
                </p>
              )}
              {found.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum token conhecido com saldo nessa carteira.
                </p>
              )}
              {found.map((t) => {
                const have = !!findToken(t.address, tokens);
                return (
                  <div key={t.address} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <strong>{t.symbol}</strong> {fmt(t.balance)}
                    </span>
                    {have ? (
                      <span className="text-xs text-muted-foreground">na lista</span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => add(t)}>
                        Adicionar
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Adicionar pelo endereço do token</Label>
          <div className="flex gap-2">
            <Input
              placeholder="0x… (contrato do token)"
              value={addr}
              onChange={(e) => setAddr(e.target.value.trim())}
            />
            <Button onClick={byAddress} disabled={busy === "addr"}>
              {busy === "addr" ? "Conferindo…" : "Adicionar"}
            </Button>
          </div>
          {/^0x[0-9a-fA-F]{40}$/.test(addr) && <ContractRisk address={addr} />}
        </div>

        {tokens.length > TOKENS.length && (
          <div className="space-y-1">
            <Label>Seus tokens</Label>
            {tokens
              .filter((t) => !TOKENS.includes(t))
              .map((t) => (
                <div key={t.address} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate">
                    <strong>{t.symbol}</strong>{" "}
                    <span className="text-muted-foreground">{t.name}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => removeToken(t.address)}>
                    Remover
                  </Button>
                </div>
              ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Para operar, o token precisa ter um par com BNB na PancakeSwap V2. Tokens novos podem ter
          taxas ou bloquear vendas — confira antes.
        </p>
      </DialogContent>
    </Dialog>
  );
}
