import type { StrategyConfig } from "./strategy";

export type RecoveryMarket = {
  priceUsd: number;
  closes: number[];
  closedTimes?: number[];
  historyFresh?: boolean;
  now: number;
};
/** Shared by real executor and display. No signing or simulated accounting here. */
export function liveRecovery(cfg: StrategyConfig, m: RecoveryMarket, consumedLow = 0) {
  const no = (reason: string) => ({ ready: false, reason, lowAt: 0 });
  const p = cfg.recovery;
  if (!p?.enabled) return no("Recuperação real desativada na estratégia salva");
  if (!m.historyFresh || !m.closedTimes || m.closedTimes.length !== m.closes.length)
    return no("Recuperação: aguardando histórico fechado, contínuo e atualizado");
  const bars = m.closes
    .map((close, i) => ({ close, at: m.closedTimes![i]! }))
    .filter((b) => b.at >= m.now / 1000 - cfg.windowHours * 3600);
  if (bars.length < Math.max(cfg.maSlow + 1, p.confirmationBars + 2))
    return no("Recuperação: histórico insuficiente na janela configurada");
  // An ordered peak -> trough -> rebound, using closes, never a single intrabar wick.
  let lowIndex = 0;
  for (let i = 1; i < bars.length; i++) if (bars[i]!.close <= bars[lowIndex]!.close) lowIndex = i;
  const low = bars[lowIndex]!;
  if (low.at <= consumedLow)
    return no("Recuperação já utilizada neste fundo; aguardando novo fundo");
  if (lowIndex < 1) return no("Recuperação: falta topo anterior à mínima na janela");
  const top = Math.max(...bars.slice(0, lowIndex).map((b) => b.close));
  const drop = (1 - low.close / top) * 100;
  if (drop < p.minDropPct)
    return no(`Recuperação: queda ${drop.toFixed(1)}%, mínimo ${p.minDropPct}%`);
  const tail = bars.slice(-p.confirmationBars - 1);
  if (
    bars.length - 1 - lowIndex < p.confirmationBars ||
    !tail.every((b, i) => i === 0 || b.close > tail[i - 1]!.close)
  )
    return no(
      `Queda ${drop.toFixed(1)}% detectada; aguardando ${p.confirmationBars} fechamentos consecutivos em alta`,
    );
  const last = bars.at(-1)!.close;
  const rebound = (last / low.close - 1) * 100;
  const liveRebound = (m.priceUsd / low.close - 1) * 100;
  if (rebound < p.reboundPct || liveRebound < p.reboundPct)
    return no(`Recuperação ${rebound.toFixed(1)}%; aguardando ${p.reboundPct}% acima da mínima`);
  if (rebound > p.maxReboundPct || liveRebound > p.maxReboundPct)
    return no(`Recuperação passou de ${p.maxReboundPct}%; entrada tardia bloqueada`);
  if (m.priceUsd < last)
    return no("Recuperação perdeu o último fechamento; aguardando nova confirmação");
  const headroom = (top / m.priceUsd - 1) * 100;
  // Configured token taxes + conservative allowance for both slippages and DEX fees.
  // Headroom is a filter, not a prediction or a promise that the old peak will return.
  const retention =
    (1 - (cfg.buyTaxPct ?? 0) / 100) *
    (1 - (cfg.sellTaxPct ?? 0) / 100) *
    (1 - cfg.maxSlippagePct / 100) ** 2 *
    0.9975 ** 2;
  const required = ((1 + Math.max(4, p.minNetPct) / 100) / retention - 1) * 100;
  if (headroom < required)
    return no(
      `Recuperação: espaço até topo ${headroom.toFixed(1)}% abaixo da margem estimada ${required.toFixed(1)}% (taxas e execução)`,
    );
  return {
    ready: true,
    lowAt: low.at,
    reason: `Recuperação confirmada: queda ${drop.toFixed(1)}%, retomada ${rebound.toFixed(1)}%, ${p.confirmationBars} fechamentos em alta; espaço ${headroom.toFixed(1)}%. Sem garantia de retorno ao topo.`,
  };
}
