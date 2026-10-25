/** Translate presentation only. Never changes the underlying execution error or transaction state. */
export function userMessage(
  error: unknown,
  fallback = "Não foi possível concluir esta ação. Confira o estado da operação antes de tentar novamente.",
): string {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
  if (/connection request reset|pairing.*expir|session.*expir|session.*disconnect/i.test(message))
    return "A conexão com o aplicativo da carteira foi interrompida ou expirou. Abra a carteira selecionada e conecte novamente. Se já confirmou um envio, confira o histórico antes de repetir.";
  if (/Wallet execution pending|execution.*lock/i.test(message))
    return "A carteira está conferindo uma operação anterior. Abra o estado do robô e verifique a operação pendente antes de tentar novamente.";
  if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(message))
    return "O valor a receber ficou abaixo do mínimo aceito. O preço ou a taxa do token pode ter mudado. Atualize a cotação antes de confirmar.";
  if (/rejected|denied|user.*cancel/i.test(message))
    return "A solicitação foi recusada ou cancelada na carteira. Confira o histórico se já havia outra operação em andamento.";
  if (/insufficient funds/i.test(message))
    return "O saldo de BNB não cobre o valor solicitado e a taxa de rede. Confira o BNB disponível na carteira selecionada.";
  if (/TRANSFER_FAILED|TransferHelper/i.test(message))
    return "O contrato do token recusou a transferência. Confira limites, taxas e possíveis restrições de venda deste token.";
  if (/EXPIRED|deadline exceeded/i.test(message))
    return "A cotação ou solicitação expirou. Confira o histórico e atualize a cotação antes de continuar.";
  if (
    /timeout|timed out|fetch failed|failed to fetch|network error|connection.*(closed|reset)|HTTP.*(429|50[0234])|rate limit|too many requests|unknown RPC error/i.test(
      message,
    )
  )
    return "Não foi possível obter uma resposta da rede agora. Se já confirmou na carteira, confira a transação no histórico antes de repetir. Para uma consulta de saldo ou preço, aguarde e atualize os dados.";
  if (/chain.*(mismatch|unsupported)|wrong network/i.test(message))
    return "A carteira está em outra rede. Selecione BNB Smart Chain e conecte a conta que contém os ativos.";
  if (/execution reverted|contract.*revert/i.test(message))
    return "O contrato recusou a operação. Confira a cotação, o saldo e as restrições do token; consulte o histórico se houver uma transação enviada.";
  if (/unauthorized|not authenticated|jwt.*expir|session not found/i.test(message))
    return "Sua sessão de acesso expirou. Entre novamente para continuar.";
  // Keep actionable messages already written in Portuguese, but never dump SDK
  // stacks, RPC URLs, SQL details or an untranslated exception into the interface.
  const first = message.split("\n")[0]?.trim() ?? "";
  if (
    /não|carteira|saldo|robô|estratégia|operação|cotação|aguard|confir|revise|escolha|informe|limite|reserva|preço|taxa|gás|conect|moeda|histórico|valor|mercado/i.test(
      first,
    ) &&
    !/https?:\/\/|stack|request body|details:|error:|exception|violates|constraint|invalid|failed|must be|not found|not supported|not available|unexpected/i.test(
      first,
    )
  )
    return first.slice(0, 600);
  return fallback;
}

export function formIssueMessage(
  issue: {
    code: string;
    message: string;
    minimum?: number | bigint;
    maximum?: number | bigint;
    inclusive?: boolean;
    expected?: unknown;
  },
  label: string,
) {
  // Custom refinements in our form schemas already have specific Portuguese copy.
  if (issue.code === "custom") return issue.message;
  if (issue.code === "too_small" && issue.minimum != null)
    return `${label}: informe um valor ${issue.inclusive ? "maior ou igual a" : "maior que"} ${issue.minimum.toLocaleString("pt-BR")}.`;
  if (issue.code === "too_big" && issue.maximum != null)
    return `${label}: informe um valor ${issue.inclusive ? "menor ou igual a" : "menor que"} ${issue.maximum.toLocaleString("pt-BR")}.`;
  if (issue.code === "invalid_type")
    return `${label}: ${issue.expected === "integer" ? "informe um número inteiro" : "informe um número válido"}.`;
  return userMessage(issue.message, `Revise o campo ${label} antes de continuar.`);
}
