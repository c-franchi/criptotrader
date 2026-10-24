import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Download,
  Share,
  PlusSquare,
  MoreVertical,
  CheckCircle2,
  Monitor,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import icon from "@/assets/app-icon.jpg";
import { getInstallState, runInstall, subscribeInstall } from "@/lib/installPrompt";

export function InstallApp() {
  const [state, setState] = useState({
    canInstall: false,
    installed: false,
    standalone: false,
    prompting: false,
    accepted: false,
  });
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [inFrame, setInFrame] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    setPlatform(
      /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? "ios"
        : /android/i.test(navigator.userAgent)
          ? "android"
          : "desktop",
    );
    setInFrame(window.self !== window.top);
    const sync = () => setState(getInstallState());
    sync();
    return subscribeInstall(sync);
  }, []);
  const install = async () => {
    try {
      if (!getInstallState().canInstall) {
        setHelp(true);
        return;
      }
      const ok = await runInstall();
      if (!ok) toast.info("Instalação cancelada. Nenhuma alteração foi feita.");
    } catch {
      toast.error("O navegador não abriu o instalador. Veja as opções abaixo.");
      setHelp(true);
    }
  };
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex flex-col items-center text-center">
        <img
          src={icon}
          alt="Robô CryptoBot dourado em 3D com velas de negociação"
          width={1024}
          height={1024}
          className="size-32 rounded-3xl sm:size-36"
        />
        <h1 className="mt-5 text-2xl font-semibold">
          {state.standalone ? "Seu CryptoBot está pronto" : "CryptoBot no seu aparelho"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state.standalone
            ? "Você já está usando o aplicativo instalado."
            : "Acesse pelo ícone na tela inicial, sem procurar a aba do navegador."}
        </p>
      </div>
      {state.installed ? (
        <>
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl bg-primary/10 p-4 text-sm font-medium text-primary"
          >
            <CheckCircle2 className="size-6 shrink-0" />
            {state.standalone
              ? "App aberto em modo instalado"
              : "Instalação confirmada pelo navegador"}
          </div>
          <Button className="h-14 w-full text-base" asChild>
            <Link to="/">
              Abrir painel
              <ArrowRight />
            </Link>
          </Button>
          {!state.standalone && (
            <p className="text-center text-sm text-muted-foreground">
              Procure o ícone do CryptoBot na tela inicial ou na lista de aplicativos.
            </p>
          )}
        </>
      ) : state.accepted ? (
        <div role="status" className="rounded-2xl bg-primary/10 p-4 text-sm">
          <b>Solicitação aceita pelo navegador.</b>
          <p className="mt-1 text-muted-foreground">
            Aguarde o ícone aparecer. A conclusão depende do aparelho.
          </p>
        </div>
      ) : (
        <>
          <Button
            size="lg"
            className="h-14 w-full text-base"
            disabled={state.prompting}
            onClick={install}
          >
            <Download className="size-5" />
            {state.prompting ? "Aguardando navegador…" : "Instalar CryptoBot"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {state.canInstall
              ? "Toque acima e confirme a instalação na janela do navegador."
              : platform === "ios"
                ? "No iPhone, a instalação é feita pelo menu Compartilhar do Safari."
                : "Se a janela não estiver disponível, o botão mostra as opções do seu navegador."}
          </p>
        </>
      )}
      {inFrame && (
        <p className="rounded-2xl bg-secondary p-4 text-sm">
          Abra o site em uma aba própria para instalar:{" "}
          <a
            href="https://criptotrader.lovable.app/instalar"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline"
          >
            abrir página de instalação
          </a>
          .
        </p>
      )}
      {!state.installed && (
        <details
          open={help}
          onToggle={(event) => setHelp(event.currentTarget.open)}
          className="rounded-2xl bg-secondary p-5"
        >
          <summary className="cursor-pointer font-medium">
            {help ? "Outras opções para instalar" : "Precisa de ajuda para instalar?"}
          </summary>
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-muted-foreground">
              {platform === "ios"
                ? "No Safari do iPhone:"
                : platform === "android"
                  ? "No Chrome do Android:"
                  : "No Chrome ou Edge do computador:"}
            </p>
            {platform === "ios" ? (
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <Share className="size-5 shrink-0 text-primary" />
                  Toque em Compartilhar.
                </li>
                <li className="flex gap-3">
                  <PlusSquare className="size-5 shrink-0 text-primary" />
                  Escolha “Adicionar à Tela de Início”.
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  Confirme em Adicionar.
                </li>
              </ol>
            ) : (
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <MoreVertical className="size-5 shrink-0 text-primary" />
                  Abra o menu do navegador.
                </li>
                <li className="flex gap-3">
                  <Download className="size-5 shrink-0 text-primary" />
                  {platform === "android"
                    ? "Escolha “Instalar app” ou “Adicionar à tela inicial”."
                    : "Selecione “Instalar CryptoBot” ou “Instalar esta página como aplicativo”."}
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  Confirme a instalação.
                </li>
              </ol>
            )}
            <p className="text-xs text-muted-foreground">
              A janela pode não aparecer em navegadores internos, quando o app já está instalado ou
              após recusar uma instalação.
            </p>
          </div>
        </details>
      )}
      <p className="flex items-start justify-center gap-2 text-center text-xs text-muted-foreground">
        <Monitor className="mt-0.5 size-4 shrink-0" />O app precisa de internet para consultar
        preços e realizar operações.
      </p>
    </div>
  );
}
