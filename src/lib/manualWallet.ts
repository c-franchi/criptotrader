/** Displayed balance and signing account must refer to the same wallet; no strategy is required. */
export function manualWalletBlocks(input: {
  expected: string | null;
  account: string | null;
  chainId: number | null;
  robot: boolean;
  balanceKnown: boolean;
}) {
  if (input.robot)
    return [
      "Este saldo pertence à carteira automática. Gerencie a posição na tela Robô; ela não pode ser assinada pela sua carteira pessoal.",
    ];
  const blocks: string[] = [];
  if (!input.account) blocks.push("Conecte a carteira selecionada para assinar a operação.");
  if (input.account && input.chainId !== 56)
    blocks.push("Mude a rede da carteira conectada para BNB Smart Chain (56).");
  if (
    input.account &&
    input.expected &&
    input.account.toLowerCase() !== input.expected.toLowerCase()
  )
    blocks.push(
      "A carteira conectada é diferente da selecionada. Troque a conta conectada ou selecione a carteira correta.",
    );
  if (!input.balanceKnown)
    blocks.push("Aguardando a consulta do saldo. Atualize para tentar novamente.");
  return blocks;
}
export function manualSearch(s: Record<string, unknown>): {
  entrada?: string;
  token?: string;
  pagamento?: "BNB";
} {
  return {
    ...(s["pagamento"] === "BNB" ? { pagamento: "BNB" as const } : {}),
    ...(typeof s["entrada"] === "string" && /^\d+(\.\d+)?$/.test(s["entrada"])
      ? { entrada: s["entrada"] }
      : {}),
    ...(typeof s["token"] === "string" && /^0x[0-9a-fA-F]{40}$/.test(s["token"])
      ? { token: s["token"] }
      : {}),
  };
}
