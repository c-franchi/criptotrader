/** Stable destinations for read-only readiness failures; these never authorize an operation. */
export type ReadinessAction =
  | "token"
  | "values"
  | "liquidity"
  | "fees"
  | "rules"
  | "fund"
  | "execution"
  | "refresh"
  | "range"
  | "costs"
  | "gas";
export type ReadinessIssue = { message: string; action: ReadinessAction };
export const readinessLabels: Record<ReadinessAction, string> = {
  token: "Escolher outra moeda",
  values: "Revisar valores",
  liquidity: "Revisar liquidez",
  fees: "Conferir taxas da moeda",
  rules: "Revisar regras",
  fund: "Ver saldo e adicionar BNB",
  execution: "Ver operação pendente",
  refresh: "Consultar novamente",
  costs: "Revisar meta e custos",
  range: "Corrigir faixa",
  gas: "Revisar limite da taxa de rede",
};
