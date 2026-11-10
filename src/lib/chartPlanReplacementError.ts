/** Only allowlisted causes cross the server boundary; never expose raw provider details. */
export function chartPlanReplacementError(error: { code?: string; message: string }): string {
  const preserved = " A atividade anterior e seu rascunho foram preservados.";
  if (error.code === "PGRST202" || error.code === "42883")
    return (
      "A função de substituição não foi encontrada com os parâmetros esperados. É necessário conferir a instalação e atualizar o cache do banco; parar ou remover o robô não resolve essa falha." +
      preserved
    );
  if (error.code === "42501" || /Server-only replacement/i.test(error.message))
    return (
      "O servidor não tem permissão para substituir a atividade. É necessário revisar a permissão de execução da função, sem liberar acesso direto às contas de usuários." +
      preserved
    );
  if (/Operação pendente|Execution in progress|Wallet execution pending/i.test(error.message))
    return (
      "Há uma operação ou trava de execução pendente nesta carteira. Aguarde a conciliação e atualize a atividade anterior; pausar não cancela uma transação enviada." +
      preserved
    );
  if (
    /estado mudou|configuração mudou|rascunho mudou|Draft changed|Strategy changed/i.test(
      error.message,
    )
  )
    return (
      "A atividade, posição ou rascunho mudou desde sua revisão. Feche esta confirmação, atualize a atividade anterior e revise novamente antes de substituir." +
      preserved
    );
  if (/não encontrada|Wallet does not belong/i.test(error.message))
    return (
      "A atividade anterior não foi encontrada para este usuário, carteira e token. Confira a carteira selecionada e atualize a atividade anterior." +
      preserved
    );
  if (/Confirmação explícita|Plano gráfico inválido/i.test(error.message))
    return (
      "A confirmação ou o plano não é válido. Reabra a revisão e confirme os dados e o aceite antes de salvar." +
      preserved
    );
  return (
    "O banco recusou a substituição sem concluir a troca. Atualize a atividade anterior; se persistir, é necessário verificar as proteções e a compatibilidade da função no servidor." +
    preserved
  );
}
