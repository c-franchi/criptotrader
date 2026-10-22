/** Only recognized domain restrictions may fall back to saving a draft. */
export function strategySaveRestriction(message: string) {
  if (/Draft changed/i.test(message))
    return {
      kind: "draft_conflict",
      text: "O rascunho foi alterado em outra janela. Reabra a estratégia para conferir antes de salvar.",
    } as const;
  if (/Strategy changed/i.test(message))
    return {
      kind: "conflict",
      text: "A versão real da estratégia mudou em outra janela. Seu rascunho não foi aplicado; confira a versão atual.",
    } as const;
  if (/Open position|posição aberta/i.test(message))
    return {
      kind: "position",
      text: "Há uma posição aberta. As regras desse ciclo foram preservadas; o rascunho não altera o robô.",
    } as const;
  if (/Execution in progress|Execução em andamento|Wallet execution pending/i.test(message))
    return {
      kind: "pending",
      text: "Uma operação anterior está pendente de confirmação. Seu rascunho está salvo; aplique após a confirmação.",
    } as const;
  return {
    kind: "unavailable",
    text: "Não foi possível acessar o salvamento. Seus campos continuam preenchidos; tente novamente sem recarregar a página.",
  } as const;
}
