import { useState } from "react";
import { ManualSaleAmountInput } from "../../src/components/ManualSaleAmountInput";
import { ManualSaleLimitsDialog } from "../../src/components/ManualSaleLimitsDialog";
import { compactTokenAmount, percentageAmount, tokenAmount, enforceManualImpact, type ManualLimits } from "../../src/lib/manualSale";
import Decimal from "decimal.js";
import { useWizardStepScroll } from "../../src/hooks/useWizardStepScroll";
import { ReplaceChartPlanDialog } from "../../src/components/ReplaceChartPlanDialog";
import { BudgetPercentageSelector } from "../../src/components/BudgetPercentageSelector";
import { createRoot } from "react-dom/client";
import { Bot, Coins, Settings2, Wallet } from "lucide-react";
import { UxActionTile, UxDetailDialog } from "../../src/components/UxDetailDialog";
import { WalletPicker } from "../../src/components/WalletPicker";
import { Button } from "../../src/components/ui/button";
import "../../src/styles.css";

const tools = [
  "Ativos e saldo",
  "Meus robôs",
  "Estado e controles",
  "Outras ferramentas",
  "Escolher porcentagem",
  "Etapas da atividade",
  "Substituir atividade",
  "Venda manual",
];
const wallets = [
  {
    id: "a",
    label: "Carteira A · teste isolado",
    detail: "Dados fictícios",
    value: "Saldo indisponível",
  },
  {
    id: "b",
    label: "Carteira B · teste isolado",
    detail: "Dados fictícios",
    value: "Saldo indisponível",
  },
];

export function WizardStepPreview() {
  const [step, setStep] = useState(1);
  const root = useWizardStepScroll(step, false);
  return (
    <div ref={root} tabIndex={-1} className="outline-none">
      <h2 className="text-lg font-bold">{step === 1 ? "Marcar entrada" : "Marcar saída"}</h2>
      <div style={{ minHeight: 1000 }}>
        <p>Conteúdo extenso de teste para rolagem entre etapas.</p>
      </div>
      <Button onClick={() => setStep(step === 1 ? 2 : 1)}>Avançar etapa</Button>
    </div>
  );
}
export function ReplacementPreview() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Revisar substituição</Button>
      {saved && <p role="status">Nova atividade salva pausada · teste</p>}
      <ReplaceChartPlanDialog
        open={open}
        onOpenChange={setOpen}
        walletName="Carteira fictícia"
        symbol="GTE"
        busy={false}
        error=""
        onConfirm={() => {
          setSaved(true);
          setOpen(false);
        }}
      />
    </>
  );
}
function ManualSalePreview() {
  const balance = 123456789123456789123456789n;
  const [value, setValue] = useState("");
  const [exact, setExact] = useState<bigint | null>(null);
  const [limits, setLimits] = useState<ManualLimits>({ maxPriceImpactPct: 0, maxSlippagePct: 7 });
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState(false);
  const [error, setError] = useState("");
  return <>
    <ManualSaleAmountInput symbol="GTE" value={value} inputRef={null} disabled={false} onChange={(v) => { setValue(v); setExact(null); setQuote(false); setError(""); }} />
    <div className="mt-3 grid grid-cols-4 gap-2">{[25,50,75,100].map((p) => <Button key={p} onClick={() => { const n = percentageAmount(balance,p); setExact(n); setValue(compactTokenAmount(n,18)); setQuote(false); setError(""); }}>{p===100?"Máx":`${p}%`}</Button>)}</div>
    {exact !== null && <p className="break-all" data-testid="exact-sale-amount">{exact.toString()}</p>}
    <Button className="mt-3 w-full" variant="outline" onClick={() => setOpen(true)}>Ajustar limites da venda</Button>
    <ManualSaleLimitsDialog open={open} onOpenChange={setOpen} limits={limits} onSave={async (next) => {setLimits(next);setQuote(false);setError("");}} />
    <Button className="mt-3 w-full" onClick={() => {try {tokenAmount(exact === null ? value : "1",18,balance);enforceManualImpact(1.08,limits);setQuote(true);setError("");} catch(e) {setError(e instanceof Error ? e.message : "erro");}}}>Cotar venda de GTE</Button>
    {error && <p role="alert">{error}</p>}
    {quote && <p role="status">Recebimento estimado: 0,001 BNB · ≈ R$ 3,50 (teste fictício)</p>}
  </>;
}
export function Preview() {
  const [tool, setTool] = useState<string | null>(null);
  const [wallet, setWallet] = useState("a");
  const [amount, setAmount] = useState("0.05");
  return (
    <div className="exchange-shell">
      <header className="border-b border-border">
        <div
          className="ux-app-toolbar mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4"
          data-testid="toolbar"
        >
          <Button size="icon" variant="ghost" aria-label="Menu de teste">
            <Settings2 />
          </Button>
          <span className="min-w-0 font-mono text-sm font-semibold">CRYPTO·BOT</span>
          <div className="ux-app-toolbar-actions ml-auto flex shrink-0 items-center">
            {["Carteira", "Preferências", "Tema", "Atualização", "Notificações"].map((label) => (
              <Button key={label} size="icon" variant="ghost" aria-label={label}>
                <Wallet />
              </Button>
            ))}
          </div>
        </div>
      </header>
      <main className="exchange-workspace mx-auto w-full min-w-0 max-w-6xl p-3" data-app-content>
        <h1 className="mb-3 text-lg font-bold">Validação isolada de interface</h1>
        <p className="mb-4 text-sm">
          Sem banco, autenticação, cotações, assinatura ou operações financeiras.
        </p>
        <div className="grid grid-cols-2 gap-2" aria-label="Ações do robô">
          {tools.map((label) => (
            <UxActionTile key={label} label={label} icon={Bot} onClick={() => setTool(label)} />
          ))}
        </div>
        <p role="status" className="my-4">
          Robô pausado · cenário fictício
        </p>
        <UxDetailDialog
          open={tool !== null}
          onOpenChange={(open) => {
            if (!open) setTool(null);
          }}
          title={tool ?? "Detalhes"}
          icon={Coins}
          description="Teste dos componentes reais usados no aplicativo."
        >
          {tool === "Venda manual" ? <ManualSalePreview /> : tool === "Etapas da atividade" ? (
            <WizardStepPreview />
          ) : tool === "Substituir atividade" ? (
            <ReplacementPreview />
          ) : tool === "Escolher porcentagem" ? (
            <>
              <label htmlFor="preview-budget">Valor para a atividade</label>
              <input
                id="preview-budget"
                type="number"
                step="any"
                className="w-full rounded-xl bg-secondary p-3"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <BudgetPercentageSelector
                available="0.1"
                value={amount}
                onSelect={(pct) =>
                  setAmount(new Decimal("0.1").mul(pct).div(100).toFixed(18, Decimal.ROUND_DOWN))
                }
              />
            </>
          ) : tool === "Outras ferramentas" ? (
            <WalletPicker options={wallets} value={wallet} onChange={setWallet} manage={false} />
          ) : (
            <>
              <p>Valores não confirmados permanecem indisponíveis.</p>
              <p data-testid="long-address">0x{"a".repeat(120)}</p>
              {Array.from({ length: 12 }, (_, index) => (
                <section
                  key={index}
                  data-panel
                  className="space-y-2 rounded-xl border border-border p-3"
                >
                  <h2 className="text-base font-semibold">Informações {index + 1}</h2>
                  <p>
                    Conteúdo extenso para verificar rolagem interna, valores longos e ações em telas
                    baixas.
                  </p>
                  <label htmlFor={`value-${index}`} className="block">
                    Valor de teste {index + 1}
                  </label>
                  <input
                    id={`value-${index}`}
                    className="w-full p-3"
                    defaultValue="0.005"
                    inputMode="decimal"
                  />
                </section>
              ))}
            </>
          )}
        </UxDetailDialog>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Preview />);
