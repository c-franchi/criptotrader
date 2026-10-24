import { useState } from "react";
import { BookOpen, ArrowRight, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

const lessons = {
  bot: [
    {
      title: "Defina seu robô",
      text: "Escolha a moeda, o modelo e quanto investir. Confira o saldo disponível antes de salvar.",
      label: "Investimento",
      caption: "Capital e compra por vez",
      illustration: "settings",
    },
    {
      title: "Acompanhe os pontos",
      text: "Verde indica compra; vermelho, venda. O robô age pelas regras salvas e pela cotação atual do par.",
      label: "Compra e venda",
      caption: "O preço precisa atingir a regra",
      illustration: "chart",
    },
    {
      title: "Encerre quando quiser",
      text: "Pausar interrompe a automação. Finalizar mantendo moedas também desativa metas e stop. Transações enviadas podem concluir.",
      label: "Manter minhas moedas",
      caption: "Custo e histórico preservados",
      illustration: "finish",
    },
  ],
  manual: [
    {
      title: "Escolha a moeda",
      text: "Veja o gráfico do par BNB e selecione Comprar ou Vender.",
      label: "Moeda / BNB",
      caption: "Sua carteira, sua operação",
      illustration: "chart",
    },
    {
      title: "Informe o valor",
      text: "Digite a quantidade ou use uma porcentagem do saldo. Confira o mínimo a receber, as taxas e o impacto.",
      label: "Valor da operação",
      caption: "25% · 50% · 75% · Máx",
      illustration: "settings",
    },
    {
      title: "Revise e assine",
      text: "Cotar não movimenta dinheiro. Revise a operação e confirme na carteira. Depois acompanhe no histórico.",
      label: "Revisar → assinar",
      caption: "Somente você confirma",
      illustration: "finish",
    },
  ],
} as const;
function TourPicture({ kind, label, caption }: { kind: string; label: string; caption: string }) {
  if (kind === "chart")
    return (
      <svg
        role="img"
        aria-label="Exemplo ilustrativo de pontos de compra e venda"
        viewBox="0 0 360 190"
        className="w-full rounded-2xl bg-secondary/50"
      >
        {[40, 80, 120, 160].map((y, i) => (
          <g key={y}>
            <line
              x1="45"
              x2="340"
              y1={y}
              y2={y}
              stroke="currentColor"
              opacity=".14"
              strokeDasharray="5 5"
            />
            <rect
              x="10"
              y={y - 10}
              width="22"
              height="20"
              rx="4"
              fill={i < 2 ? "#ee4266" : "#14b887"}
            />
            <text x="21" y={y + 4} textAnchor="middle" fontSize="12" fill="white">
              {i < 2 ? "V" : "C"}
            </text>
          </g>
        ))}
        <path
          d="M55 120 L110 60 L160 120 L210 150 L260 95 L315 55"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        {[
          [55, 120],
          [110, 60],
          [160, 120],
          [210, 150],
          [260, 95],
          [315, 55],
        ].map(([x, y], i) => (
          <circle key={x} cx={x} cy={y} r="5" fill={i === 1 || i === 5 ? "#ee4266" : "#14b887"} />
        ))}
        <text x="180" y="184" textAnchor="middle" fontSize="10" fill="currentColor" opacity=".5">
          Ilustração educativa · não é previsão de preço
        </text>
      </svg>
    );
  return (
    <div
      className="rounded-2xl bg-secondary/60 p-6"
      aria-label="Exemplo ilustrativo de configuração"
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-background p-4">
        <span className="h-3 w-28 rounded bg-border" />
        {kind === "finish" ? (
          <Check className="text-success" />
        ) : (
          <span className="text-sm">BNB</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="h-10 rounded-xl bg-background" />
        <div className="h-10 rounded-xl bg-background" />
      </div>
      <p className="mt-5 text-sm font-medium">{caption}</p>
    </div>
  );
}
export function TradingTour({
  kind,
  onComplete,
}: {
  kind: "bot" | "manual";
  onComplete?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0);
  const lesson = lessons[kind][step]!;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
      >
        <BookOpen />
        Como usar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="exchange-workspace trading-tour h-[85dvh] max-h-[46rem] overflow-auto rounded-t-3xl border-0 p-6 sm:max-w-lg sm:rounded-3xl">
          <div className="mb-4 flex gap-1.5 pr-8" aria-label={`Passo ${step + 1} de 3`}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= step ? "bg-foreground" : "bg-border"}`}
              />
            ))}
          </div>
          <DialogHeader>
            <DialogTitle className="text-left text-3xl font-semibold tracking-tight">
              {lesson.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Guia rápido de {kind === "bot" ? "robôs" : "operação manual"}
            </DialogDescription>
          </DialogHeader>
          <div className="my-5">
            <TourPicture kind={lesson.illustration} label={lesson.label} caption={lesson.caption} />
          </div>
          <p className="min-h-24 text-base leading-relaxed">{lesson.text}</p>
          <div className="mt-6 flex gap-3">
            {step > 0 && (
              <Button
                variant="secondary"
                className="h-12 flex-1 rounded-xl"
                onClick={() => setStep(step - 1)}
              >
                Voltar
              </Button>
            )}
            <Button
              className="h-12 flex-1 rounded-xl"
              onClick={() => {
                if (step < 2) setStep(step + 1);
                else {
                  setOpen(false);
                  onComplete?.();
                }
              }}
            >
              {step < 2 ? "Seguinte" : kind === "bot" ? "Configurar robô" : "Abrir operação"}
              <ArrowRight />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
