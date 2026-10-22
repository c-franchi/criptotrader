import { useSelectedWallet } from "@/hooks/useSelectedWallet";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCandles } from "@/hooks/useCandles";
import { referenceHigh } from "@/lib/autoStrategy";
import { monitorState } from "@/lib/monitor";
import { EMPTY_CONFIG, type StrategyConfig } from "@/lib/strategy";
import type { PoolInfo } from "@/lib/chain.functions";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumSignificantDigits: 6 });

/**
 * Watches the live price against the saved strategy for the selected token.
 * Shows a persistent banner and fires a toast once per crossing when the
 * price enters a buy/sell trigger zone.
 */
export function StrategyAlert({
  address,
  symbol,
  pools,
}: {
  address: string;
  symbol: string;
  pools: PoolInfo[];
}) {
  const { user } = useAuth();
  const { walletScope } = useSelectedWallet();
  const strategy = useQuery({
    queryKey: ["strategy", user?.id, walletScope, address],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("strategies")
        .select("config")
        .eq("user_id", user!.id)
        .eq("wallet_scope", walletScope)
        .eq("token", address)
        .maybeSingle();
      return data
        ? ({ ...EMPTY_CONFIG, ...(data.config as Partial<StrategyConfig>) } as StrategyConfig)
        : null;
    },
    staleTime: 30_000,
  });
  const cfg = strategy.data;
  const pool = pools.find((p) => p.supported) ?? pools[0];
  const candles = useCandles(
    cfg && (cfg.referenceType !== "manual" || cfg.entryType !== "queda")
      ? pool?.pairAddress
      : undefined,
    address,
  );
  const rawPrice = Number(pool?.priceUsd);
  const price = rawPrice > 0 && Number.isFinite(rawPrice) ? rawPrice : null;
  const since = Date.now() - (cfg?.windowHours ?? 24) * 3_600_000;
  const high24h = candles.data?.length ? referenceHigh(candles.data, since / 1000) : null;

  const step = { "5m": 1, "15m": 3, "1h": 12, "4h": 48 }[cfg?.candleInterval ?? "15m"] ?? 3;
  const all = candles.data ?? [];
  const closes: number[] = [];
  for (let i = all.length - 1 - step; i >= 0; i -= step) closes.unshift(all[i]![4]); // skip the still-open interval
  const state = cfg ? monitorState(cfg, price, high24h, closes) : null;
  const active = state?.alerts.filter((a) => a.active) ?? [];

  // toast once per crossing (alert becomes active / leaves the zone)
  const prev = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!state) return;
    const now = new Set(state.alerts.filter((a) => a.active).map((a) => a.label));
    for (const a of state.alerts) {
      if (now.has(a.label) && !prev.current.has(a.label)) {
        const msg = `${symbol}: ${a.kind === "compra" ? "preço entrou na faixa de COMPRA" : a.kind === "take" ? "preço atingiu o TAKE-PROFIT" : "preço atingiu o STOP-LOSS"}`;
        if (a.kind === "stop") toast.error(msg, { description: a.label });
        else toast.success(msg, { description: a.label });
      }
    }
    prev.current = now;
  }, [state, symbol]);

  if (!user) return null;
  if (strategy.isLoading) return null;
  if (!cfg) {
    return (
      <p className="mb-4 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        Nenhuma estratégia salva para {symbol}.{" "}
        <Link to="/estrategia" className="text-primary underline">
          Criar estratégia
        </Link>{" "}
        para receber avisos de compra e venda.
      </p>
    );
  }
  if (!state || state.alerts.length === 0) {
    return (
      <p className="mb-4 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        Monitoramento de {symbol}:{" "}
        {state?.reference == null
          ? "aguardando preço de referência (máxima de 24h ou referência manual)."
          : cfg.entryType === "medias"
            ? "aguardando histórico de preços para calcular as médias."
            : "esta estratégia não tem gatilhos de preço para monitorar."}
      </p>
    );
  }

  return (
    <section
      aria-label={`Monitoramento da estratégia de ${symbol}`}
      className="mb-4 rounded-lg border border-border bg-card p-3"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <BellRing className="h-3.5 w-3.5" /> Monitoramento da estratégia · {symbol}
      </p>
      <ul className="mt-2 space-y-1.5">
        {state.alerts.map((a) => (
          <li
            key={a.label}
            role={a.active ? "alert" : undefined}
            className={cn(
              "rounded border p-2 text-sm",
              a.active
                ? a.kind === "stop"
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-success/50 bg-success/10 text-success"
                : "border-border/60 text-muted-foreground",
            )}
          >
            <span className="font-medium">
              {a.active ? "● DENTRO DA FAIXA — " : "○ "}
              {a.label}
            </span>
            <span className="ml-1 font-mono text-xs">dispara em {fmt(a.triggerAt)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Preço atual {price != null ? `US$ ${fmt(price)}` : "indisponível"} · referência:{" "}
        {state.reference != null ? fmt(state.reference) : "—"} ({state.referenceLabel}) · verificado
        a cada 30s com o preço do painel.
      </p>
    </section>
  );
}
