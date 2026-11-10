import { expect, it } from "vitest";
import { chartPlanReplacementError } from "./chartPlanReplacementError";

it.each([
  ["PGRST202", "missing", "cache do banco"],
  ["42883", "missing", "parâmetros esperados"],
  ["42501", "denied", "permissão"],
  ["P0001", "Operação pendente", "Aguarde a conciliação"],
  ["P0001", "O estado mudou", "revise novamente"],
  ["P0001", "Draft changed", "rascunho mudou"],
  ["P0001", "Atividade anterior não encontrada", "carteira selecionada"],
])("explains %s/%s without leaking provider details", (code, message, action) => {
  const result = chartPlanReplacementError({ code, message });
  expect(result).toContain(action);
  expect(result).toContain("rascunho foram preservados");
});

it("does not expose arbitrary server error details", () => {
  const result = chartPlanReplacementError({ code: "XX000", message: "internal-private-detail" });
  expect(result).not.toContain("internal-private-detail");
  expect(result).toContain("compatibilidade da função");
});