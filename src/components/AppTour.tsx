import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  CandlestickChart,
  Check,
  LayoutDashboard,
  MousePointer2,
  Settings,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

const steps = [
  {
    title: "Comece pelo painel",
    text: "Escolha a moeda para acompanhar preço e mercado. A seleção acompanha você nas outras telas.",
    icon: LayoutDashboard,
    route: "/",
    action: "Abrir painel",
    tools: ["Escolher moeda", "Preço atual", "Mercado"],
  },
  {
    title: "Organize suas carteiras",
    text: "Salve o endereço público e escolha a carteira no topo. Veja o saldo livre, as reservas e o valor em posições.",
    icon: Wallet,
    route: "/carteiras",
    action: "Abrir carteiras",
    tools: ["Saldo livre", "Reservado", "Em posições"],
  },
  {
    title: "Compre ou venda",
    text: "Em Operar, escolha Comprar ou Vender e informe o valor. Cote, revise e só então confirme na sua carteira.",
    icon: ArrowLeftRight,
    route: "/operar",
    action: "Abrir operação manual",
    tools: ["Comprar", "Vender", "Revisar"],
  },
  {
    title: "Configure seu robô",
    text: "Defina investimento, compras, meta e proteção. O máximo de compras inclui a primeira. Salvar não inicia o robô.",
    icon: Bot,
    route: "/grade",
    action: "Abrir robôs",
    tools: ["Valores", "Regras", "Autorizar início"],
  },
  {
    title: "Explore o gráfico",
    text: "Alterne Velas e Linha. Em Ferramentas, selecione Medir e marque dois pontos; arraste para mover. Ampliar abre a tela cheia.",
    icon: CandlestickChart,
    route: "/operar",
    action: "Abrir gráfico",
    tools: ["Velas / Linha", "Medir", "Ampliar"],
  },
  {
    title: "Receba avisos",
    text: "Configure avisos de preço e ative as notificações no aparelho. Os avisos informam; não compram nem vendem.",
    icon: Bell,
    route: "/alertas",
    action: "Abrir avisos",
    tools: ["Avisos de preço", "Notificações"],
  },
  {
    title: "Deixe do seu jeito",
    text: "Na engrenagem do topo, escolha Real, Dólar ou Euro. Alterne o tema no ícone ao lado. Para rever este guia, abra Menu → Tour guiado.",
    icon: Settings,
    tools: ["Moeda de exibição", "Tema", "Tour no menu"],
  },
] as const;

export function AppTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);
  const lesson = steps[step]!;
  const Icon = lesson.icon;
  const last = step === steps.length - 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-tour exchange-workspace w-[calc(100vw-1.5rem)] max-w-lg rounded-3xl border-0 p-5 sm:p-7">
        <div className="flex gap-1.5 pr-8" aria-label={`Passo ${step + 1} de ${steps.length}`}>
          {steps.map((s, i) => (
            <span
              key={s.title}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
        <DialogHeader className="text-left">
          <p className="mb-1 text-xs font-medium text-primary">
            Tour guiado · {step + 1} de {steps.length}
          </p>
          <DialogTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {lesson.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Conheça as ferramentas do CryptoBot sem executar operações.
          </DialogDescription>
        </DialogHeader>
        <div
          className="my-2 rounded-2xl bg-secondary p-6"
          aria-label="Visão das ferramentas deste passo"
        >
          <div className="mb-5 flex items-center justify-between">
            <Icon className="size-10 text-primary" strokeWidth={1.5} />
            <MousePointer2 className="size-5 text-muted-foreground" />
          </div>
          <div className="flex flex-wrap gap-2">
            {lesson.tools.map((tool, i) => (
              <span
                key={tool}
                className={`rounded-xl bg-background px-3 py-2 text-sm font-medium ${step === 2 && i === 0 ? "text-success" : step === 2 && i === 1 ? "text-destructive" : ""}`}
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
        <p className="min-h-20 text-base leading-relaxed">{lesson.text}</p>
        {"route" in lesson && (
          <Button
            variant="ghost"
            className="justify-start px-0 text-primary"
            onClick={() => {
              onOpenChange(false);
              void navigate({ to: lesson.route });
            }}
          >
            {lesson.action}
            <ArrowUpRight className="size-4" />
          </Button>
        )}
        <div className="mt-2 flex gap-3">
          {step > 0 && (
            <Button variant="secondary" className="h-12 flex-1" onClick={() => setStep(step - 1)}>
              Voltar
            </Button>
          )}
          <Button
            className="h-12 flex-1"
            onClick={() => {
              if (last) onOpenChange(false);
              else setStep(step + 1);
            }}
          >
            {last ? "Concluir tour" : "Seguinte"}
            {last ? <Check /> : <ArrowRight />}
          </Button>
        </div>
        <button className="py-1 text-sm text-muted-foreground" onClick={() => onOpenChange(false)}>
          Agora não · rever pelo menu
        </button>
      </DialogContent>
    </Dialog>
  );
}
