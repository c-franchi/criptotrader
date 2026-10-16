import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, Panel, RequireLogin } from "@/components/AppShell";
import { useSelectedToken } from "@/hooks/useSelectedToken";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getMarket } from "@/lib/chain.functions";
import { alertState, movePct, targetPrice, type AlertState } from "@/lib/alerts";
import { enablePush } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [
      { title: "Avisos no celular — CryptoBot" },
      { name: "description", content: "Receba um aviso no celular quando o preço do token chegar perto do seu ponto de compra ou venda." },
      { property: "og:title", content: "Avisos no celular — CryptoBot" },
      { property: "og:description", content: "Receba um aviso no celular quando o preço chegar perto do seu ponto de compra ou venda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequireLogin>
        <Alerts />
      </RequireLogin>
    </AppShell>
  ),
});

const fmt = (n: number) => (n < 0.01 ? n.toPrecision(4) : n.toFixed(4)).replace(".", ",");
const num = (s: string) => Number(s.replace(",", "."));
const STATE_TXT: Record<AlertState, string> = { longe: "○ Longe do ponto", perto: "● Chegando perto", atingiu: "● Chegou no ponto" };

function Alerts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { token, ready } = useSelectedToken();
  const market = useQuery({ queryKey: ["market", token.address], queryFn: () => getMarket({ data: { address: token.address } }), enabled: ready, refetchInterval: 30_000 });
  const price = Number(market.data?.pools?.find((p) => p.priceUsd)?.priceUsd) || null;

  const [direction, setDirection] = useState<"queda" | "alta">("queda");
  const [base, setBase] = useState("");
  const [target, setTarget] = useState("20");
  const [warn, setWarn] = useState("2");
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (price && !base) setBase(String(price)); }, [price, base]);
  useEffect(() => { setBase(""); }, [token.address]);

  const devices = useQuery({ queryKey: ["push_devices", user?.id], queryFn: async () => (await supabase.from("push_devices").select("id")).data ?? [] });
  const alerts = useQuery({ queryKey: ["price_alerts", user?.id], queryFn: async () => (await supabase.from("price_alerts").select("*").order("created_at", { ascending: false })).data ?? [], refetchInterval: 60_000 });
  useEffect(() => { if (typeof Notification !== "undefined") setPushOn(Notification.permission === "granted"); }, []);

  const activate = async () => {
    setBusy(true);
    try {
      const r = await enablePush();
      if (r.status === "registered") {
        await supabase.from("push_devices").upsert({ user_id: user!.id, token: r.token }, { onConflict: "token" });
        setPushOn(true);
        qc.invalidateQueries({ queryKey: ["push_devices"] });
        toast.success("Avisos ativados neste celular!");
      } else {
        toast.error({
          "open-in-new-tab": "Abra o app instalado (ou o site em uma aba própria) para ativar os avisos.",
          denied: "Os avisos foram bloqueados. Libere as notificações nas configurações do navegador para este site.",
          unsupported: "Este navegador não aceita avisos. No iPhone, instale o app na tela de início primeiro.",
          "not-configured": "O envio de avisos ainda não está configurado.",
        }[r.status]);
      }
    } catch (e) {
      toast.error("Não foi possível ativar os avisos. Tente de novo.");
      console.error(e);
    } finally { setBusy(false); }
  };

  const rule = { direction, basePrice: num(base), targetPct: num(target), warnBeforePct: num(warn) };
  const valid = rule.basePrice > 0 && rule.targetPct > 0 && rule.warnBeforePct >= 0 && rule.warnBeforePct < rule.targetPct;

  const save = async () => {
    if (!valid) return undefined;
    setBusy(true);
    const { error } = await supabase.from("price_alerts").insert({
      user_id: user!.id, token_address: token.address, symbol: token.symbol, direction,
      base_price: rule.basePrice, target_pct: rule.targetPct, warn_before_pct: rule.warnBeforePct,
      last_state: price ? alertState(rule, price) : "longe",
    });
    setBusy(false);
    if (error) { toast.error("Não foi possível salvar o aviso."); return undefined; }
    toast.success("Aviso criado!");
    return undefined;
    qc.invalidateQueries({ queryKey: ["price_alerts"] });
  };

  const remove = async (id: string) => {
    await supabase.from("price_alerts").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["price_alerts"] });
  };

  const hasDevice = (devices.data?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <Panel title="1. Ativar avisos neste celular">
        {hasDevice && pushOn ? (
          <p className="rounded-md border border-primary bg-primary/10 p-3 text-sm font-medium text-primary">✓ Avisos ativados neste celular</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Toque no botão e aceite quando o celular perguntar. Funciona melhor com o app instalado.</p>
            <Button size="lg" className="w-full" onClick={activate} disabled={busy}>Ativar avisos no celular</Button>
          </div>
        )}
      </Panel>

      <Panel title={`2. Criar um aviso para ${token.symbol}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={direction === "queda" ? "default" : "outline"} onClick={() => setDirection("queda")}>{direction === "queda" ? "✓ " : ""}Quando cair (comprar)</Button>
            <Button variant={direction === "alta" ? "default" : "outline"} onClick={() => setDirection("alta")}>{direction === "alta" ? "✓ " : ""}Quando subir (vender)</Button>
          </div>
          <div>
            <Label>Preço de partida (US$)</Label>
            <Input inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Preço agora: {price ? `US$ ${fmt(price)}` : "indisponível"}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{direction === "queda" ? "Comprar com queda de (%)" : "Vender com alta de (%)"}</Label>
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <Label>Avisar quando faltar (%)</Label>
              <Input inputMode="decimal" value={warn} onChange={(e) => setWarn(e.target.value)} />
            </div>
          </div>
          {valid && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              Você recebe <b>“chegando perto”</b> com {direction} de <b>{fmt(rule.targetPct - rule.warnBeforePct)}%</b> (US$ {fmt(rule.basePrice * (1 + (direction === "queda" ? -1 : 1) * (rule.targetPct - rule.warnBeforePct) / 100))})
              {" "}e <b>“chegou no ponto”</b> com {fmt(rule.targetPct)}% (US$ {fmt(targetPrice(rule))}).
            </div>
          )}
          <Button size="lg" className="w-full" onClick={save} disabled={!valid || busy}>Salvar aviso</Button>
          <p className="text-xs text-muted-foreground">O app confere o preço a cada minuto, mesmo com o celular fechado. É só um aviso: nenhuma compra ou venda é feita sozinha.</p>
        </div>
      </Panel>

      <Panel title="Seus avisos">
        {!alerts.data?.length ? <p className="text-sm text-muted-foreground">Nenhum aviso criado ainda.</p> : (
          <ul className="space-y-2">
            {alerts.data.map((a) => {
              const r = { direction: a.direction as "queda" | "alta", basePrice: Number(a.base_price), targetPct: Number(a.target_pct), warnBeforePct: Number(a.warn_before_pct) };
              const p = a.token_address.toLowerCase() === token.address.toLowerCase() && price ? price : a.last_price ? Number(a.last_price) : null;
              const st = p ? alertState(r, p) : null;
              return (
                <li key={a.id} className={`rounded-md border p-3 text-sm ${st && st !== "longe" ? "border-primary" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{a.symbol} · {r.direction === "queda" ? "queda" : "alta"} de {fmt(r.targetPct)}%</p>
                      <p className="text-muted-foreground">Partida US$ {fmt(r.basePrice)} → ponto US$ {fmt(targetPrice(r))}</p>
                      {p && <p className="text-muted-foreground">Agora: {r.direction === "queda" ? "caiu" : "subiu"} {fmt(Math.max(0, movePct(r, p)))}%</p>}
                      {st && <p className={st === "longe" ? "text-muted-foreground" : "font-semibold text-primary"}>{STATE_TXT[st]}</p>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => remove(a.id)}>Remover</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
