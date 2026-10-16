import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getMarket } from "@/lib/chain.functions";
import { alertState, movePct, targetPrice, type AlertRule } from "@/lib/alerts";
import { breakEvenPct } from "@/lib/tokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fmt = (n: number) => (n < 0.01 ? n.toPrecision(4) : n.toFixed(2)).replace(".", ",");
const num = (s: string) => Number(s.replace(",", "."));
type Dir = "queda" | "alta";
type Row = { id: string; direction: string; base_price: number; target_pct: number; warn_before_pct: number };

/** Buy/sell alerts for ONE token — each token keeps its own points and tax. */
export function TokenAlerts({ token, tax }: { token: { address: string; symbol: string }; tax: { buy: number; sell: number } }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const market = useQuery({ queryKey: ["market", token.address], queryFn: () => getMarket({ data: { address: token.address } }), refetchInterval: 30_000 });
  const price = Number(market.data?.pools?.find((p) => p.priceUsd)?.priceUsd) || null;
  const saved = useQuery({
    queryKey: ["price_alerts", user?.id, token.address.toLowerCase()],
    enabled: !!user,
    queryFn: async () => ((await supabase.from("price_alerts").select("id, direction, base_price, target_pct, warn_before_pct").ilike("token_address", token.address)).data ?? []) as Row[],
  });
  const devices = useQuery({ queryKey: ["push_devices", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("push_devices").select("id")).data ?? [] });

  if (!user) return null;
  const be = breakEvenPct(tax);
  return (
    <Panel title={`Avisos no celular · ${token.symbol}`} right={<Link to="/alertas" className="text-xs text-primary underline">Ver monitoramento ›</Link>}>
      <div className="space-y-4">
        {(devices.data?.length ?? 0) === 0 && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            Os avisos ainda não estão ligados neste celular. <Link to="/alertas" className="font-semibold text-primary underline">Ativar avisos</Link>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Estes pontos valem só para o {token.symbol}. Taxa do token: {tax.buy}% na compra e {tax.sell}% na venda
          {be > 0 && <> — para vender com lucro, a alta precisa passar de <b>{be.toFixed(1)}%</b></>}.
        </p>
        {(["queda", "alta"] as Dir[]).map((d) => (
          <AlertEditor key={`${token.address}-${d}`} dir={d} symbol={token.symbol} address={token.address} price={price}
            row={saved.data?.find((r) => r.direction === d)} minUp={d === "alta" ? be : 0}
            onChange={() => qc.invalidateQueries({ queryKey: ["price_alerts"] })} userId={user.id} />
        ))}
      </div>
    </Panel>
  );
}

function AlertEditor({ dir, symbol, address, price, row, minUp, onChange, userId }: {
  dir: Dir; symbol: string; address: string; price: number | null; row?: Row | undefined; minUp: number; onChange: () => void; userId: string;
}) {
  const [base, setBase] = useState("");
  const [target, setTarget] = useState(dir === "queda" ? "20" : String(Math.max(20, Math.ceil(minUp + 5))));
  const [warn, setWarn] = useState("2");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row) { setBase(String(row.base_price)); setTarget(String(row.target_pct)); setWarn(String(row.warn_before_pct)); }
  }, [row]);
  useEffect(() => { if (!row && !base && price) setBase(String(price)); }, [row, base, price]);

  const rule: AlertRule = { direction: dir, basePrice: num(base), targetPct: num(target), warnBeforePct: num(warn) };
  const valid = rule.basePrice > 0 && rule.targetPct > 0 && rule.warnBeforePct >= 0 && rule.warnBeforePct < rule.targetPct;
  const st = row && price ? alertState({ direction: dir, basePrice: Number(row.base_price), targetPct: Number(row.target_pct), warnBeforePct: Number(row.warn_before_pct) }, price) : null;
  const sign = dir === "queda" ? -1 : 1;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const payload = { base_price: rule.basePrice, target_pct: rule.targetPct, warn_before_pct: rule.warnBeforePct, last_state: price ? alertState(rule, price) : "longe", enabled: true };
    const { error } = row
      ? await supabase.from("price_alerts").update(payload).eq("id", row.id)
      : await supabase.from("price_alerts").insert({ ...payload, user_id: userId, token_address: address, symbol, direction: dir });
    setBusy(false);
    if (error) { toast.error("Não foi possível salvar o aviso."); return; }
    toast.success(`Aviso de ${dir === "queda" ? "compra" : "venda"} do ${symbol} salvo!`);
    onChange();
  };
  const remove = async () => {
    if (!row) return;
    await supabase.from("price_alerts").delete().eq("id", row.id);
    onChange();
  };

  return (
    <div className={`space-y-3 rounded-md border p-3 ${row ? "border-primary" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{dir === "queda" ? "Aviso de compra (quando cair)" : "Aviso de venda (quando subir)"}</p>
        {row && <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">✓ Ligado</span>}
      </div>
      <div>
        <Label>Preço de partida (US$)</Label>
        <div className="flex gap-2">
          <Input inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder={price ? String(price) : ""} />
          {price && <Button type="button" variant="outline" onClick={() => setBase(String(price))}>Usar atual</Button>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Preço agora: {price ? `US$ ${fmt(price)}` : "indisponível"}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{dir === "queda" ? "Queda de (%)" : "Alta de (%)"}</Label>
          <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div>
          <Label>Avisar antes (%)</Label>
          <Input inputMode="decimal" value={warn} onChange={(e) => setWarn(e.target.value)} />
        </div>
      </div>
      {dir === "alta" && minUp > 0 && rule.targetPct > 0 && rule.targetPct < minUp && (
        <p className="text-xs text-destructive">Com a taxa do {symbol}, uma alta de {fmt(rule.targetPct)}% ainda dá prejuízo. Use mais de {minUp.toFixed(1)}%.</p>
      )}
      {valid && (
        <p className="text-sm">
          “Chegando perto” em US$ {fmt(rule.basePrice * (1 + sign * (rule.targetPct - rule.warnBeforePct) / 100))} · “Chegou no ponto” em <b>US$ {fmt(targetPrice(rule))}</b>
        </p>
      )}
      {row && price && st && (
        <p className={st === "longe" ? "text-sm text-muted-foreground" : "text-sm font-semibold text-primary"}>
          Agora: {dir === "queda" ? "caiu" : "subiu"} {fmt(Math.max(0, movePct({ direction: dir, basePrice: Number(row.base_price), targetPct: 0, warnBeforePct: 0 }, price)))}% ·{" "}
          {st === "longe" ? "○ longe do ponto" : st === "perto" ? "● chegando perto" : "● chegou no ponto"}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save} disabled={!valid || busy}>{row ? "Atualizar aviso" : "Ligar aviso"}</Button>
        {row && <Button variant="outline" onClick={remove}>Desligar</Button>}
      </div>
    </div>
  );
}
