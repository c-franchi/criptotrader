import { useEffect, useState } from "react";
import type { Candle } from "@/lib/backtest";
import type { StrategyConfig } from "@/lib/strategy";
import { CANDIDATE_DEFAULTS, replayCandidate, type CandidatePolicy } from "@/lib/candidateStrategy";
import { COST_DEFAULTS, type CostAssumptions } from "@/lib/costLedger";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/AppShell";

export function StrategyComparison({
  candles,
  cfg,
  budget,
  liquidity,
}: {
  candles: Candle[];
  cfg: StrategyConfig;
  budget: number;
  liquidity: number | null;
}) {
  const [policy, setPolicy] = useState(CANDIDATE_DEFAULTS);
  const [costs, setCosts] = useState(COST_DEFAULTS);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
  }, [candles]);
  const actualCosts = { ...costs, buyTaxPct: cfg.buyTaxPct ?? 0, sellTaxPct: cfg.sellTaxPct ?? 0 };
  const normalizedPolicy = {
    ...policy,
    slopeBars: Math.max(1, Math.floor(policy.slopeBars)),
    recoveryBars: Math.max(2, Math.floor(policy.recoveryBars)),
    regimeBars: Math.max(1, Math.floor(policy.regimeBars)),
  };
  const results = [
    { label: "Entrada anterior · replay normalizado", legacy: true, rebuys: 0 as const },
    { label: "Candidata · sem recompra", legacy: false, rebuys: 0 as const },
    { label: "Candidata · uma recompra", legacy: false, rebuys: 1 as const },
  ].map((row) => ({
    ...row,
    result: replayCandidate(
      candles,
      cfg,
      budget,
      actualCosts,
      { ...normalizedPolicy, maxRebuys: row.rebuys },
      now,
      row.legacy,
    ),
  }));
  const field = (key: keyof CandidatePolicy, text: string, min = 0) => (
    <div key={key}>
      <Label>{text}</Label>
      <Input
        type="number"
        min={min}
        step="any"
        value={Number(policy[key])}
        onChange={(e) => setPolicy((p) => ({ ...p, [key]: Math.max(min, Number(e.target.value)) }))}
      />
    </div>
  );
  const costField = (key: keyof CostAssumptions, text: string) => (
    <div key={key}>
      <Label>{text}</Label>
      <Input
        type="number"
        min={0}
        step="any"
        value={costs[key]}
        onChange={(e) => setCosts((p) => ({ ...p, [key]: Math.max(0, Number(e.target.value)) }))}
      />
    </div>
  );
  return (
    <Panel collapsible title="Comparar regras candidatas · só simulação">
      <p className="text-xs text-warning">
        Nenhuma regra desta comparação é usada com dinheiro real. Orçamento máximo igual; parcelas
        fixadas antes da primeira compra, reserva de gás separada. Sem martingale.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field("slopeBars", "Inclinação SMA 21: janela de velas", 1)}
        {field("tolerancePct", "Tolerância na região da média (%)")}
        {field("spacingPct", "Espaçamento mínimo entre compras (%)")}
        {field("recoveryBars", "Velas crescentes para recuperação", 2)}
        {field("regimeBars", "Velas para confirmar regime", 1)}
        {field("safetyPct", "Margem de segurança (%)")}
        {costField("gasPerTrade", "Gás estimado por operação (BNB)")}
        {costField("approvalGas", "Gás estimado da aprovação (BNB)")}
        {costField("impactPct", "Impacto estimado por troca (%)")}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Taxas do token: {actualCosts.buyTaxPct}% compra / {actualCosts.sellTaxPct}% venda; DEX:{" "}
        {actualCosts.dexFeePct}% por troca. Gás e impacto em zero significam custos ainda não
        informados, não gratuidade. Slippage e cotação real de saída não são reconstruídos.
      </p>
      {liquidity == null || liquidity < cfg.minLiquidityUsd ? (
        <p className="mt-3 text-xs text-warning">
          Liquidez atual insuficiente ou desconhecida. A liquidez histórica não está disponível; não
          é possível validar esse filtro no replay.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Liquidez atual atende ao mínimo; liquidez histórica não verificada.
        </p>
      )}
      <div className="mt-3 space-y-3">
        {results.map(({ label, result }) => (
          <div key={label} className="border-t border-border pt-3 text-sm">
            <p className="font-semibold">{label}</p>
            {result ? (
              <>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt>Resultado estimado de liquidação</dt>
                    <dd className={result.pnlPct >= 0 ? "text-success" : "text-destructive"}>
                      {result.pnlPct.toFixed(2)}%
                    </dd>
                  </div>
                  <div>
                    <dt>Queda máxima do capital</dt>
                    <dd>{result.maxDrawdownPct.toFixed(2)}%</dd>
                  </div>
                  <div>
                    <dt>Comprar e manter (mesmos custos)</dt>
                    <dd>{result.holdPnlPct.toFixed(2)}%</dd>
                  </div>
                  <div>
                    <dt>Ciclos encerrados</dt>
                    <dd>{result.cycles}</dd>
                  </div>
                  <div>
                    <dt>Exposição máxima</dt>
                    <dd>{result.maxExposure.toFixed(6)} BNB</dd>
                  </div>
                  <div>
                    <dt>Operações simuladas</dt>
                    <dd>{result.trades}</dd>
                  </div>
                  <div>
                    <dt>Orçamento inicial máximo</dt>
                    <dd>{result.budget.toFixed(6)} BNB</dd>
                  </div>
                  <div>
                    <dt>Gás/aprovações estimados</dt>
                    <dd>{result.gas.toFixed(6)} BNB</dd>
                  </div>
                  <div>
                    <dt>Resultado realizado simulado</dt>
                    <dd>{result.realized.toFixed(6)} BNB</dd>
                  </div>
                  <div>
                    <dt>Valor pela cotação / liquidação</dt>
                    <dd>
                      {result.markValue.toFixed(6)} / {result.liquidationValue.toFixed(6)} BNB
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs">Por que espera: {result.waiting}</p>
                <details className="mt-2 text-xs">
                  <summary>Decisões e valores utilizados</summary>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(result.events, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <p className="text-xs text-warning">
                Histórico fechado e contínuo insuficiente para comparar.
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Preços de entrada/saída no fechamento, sem presumir ordem intravela. A comparação anterior
        normaliza saídas e custos; não reproduz perfeitamente o robô antigo. Poucas operações e
        cerca de 25h de histórico não comprovam superioridade.
      </p>
    </Panel>
  );
}
