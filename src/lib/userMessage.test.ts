import { expect, it } from "vitest";
import { userMessage, formIssueMessage } from "./userMessage";

it("explains the WalletConnect reset shown by the user in Portuguese", () => {
  const message = userMessage(new Error("Connection request reset. Please try again."));
  expect(message).toContain("conexão com o aplicativo da carteira");
  expect(message).toContain("confira o histórico");
  expect(message).not.toContain("Please");
});
it.each([
  ["insufficient funds for gas", "saldo de BNB"],
  ["User rejected request", "recusada ou cancelada"],
  ["Wallet execution pending", "operação anterior"],
  ["HTTP request failed: 429", "resposta da rede"],
  ["The contract function reverted", "contrato recusou"],
  ["Unknown RPC error occurred", "histórico antes de repetir"],
  ["wrong network", "BNB Smart Chain"],
])("translates %s without claiming an uncertain transaction was not sent", (input, expected) => {
  const message = userMessage(input);
  expect(message).toContain(expected);
  expect(message).not.toContain("Nada foi enviado");
});
it("preserves a useful Portuguese validation and hides unknown SDK/SQL internals", () => {
  expect(userMessage("Informe o valor por compra.")).toBe("Informe o valor por compra.");
  expect(userMessage("Saldo insuficiente.\nRequest body: secret")).toBe("Saldo insuficiente.");
  expect(userMessage("Token not supported", "Não foi possível consultar este token.")).toBe(
    "Não foi possível consultar este token.",
  );
  expect(
    userMessage(new Error("violates constraint wallet https://example.test?key=secret")),
  ).not.toContain("secret");
});
it("explains numeric form errors with the field name and bounds in Portuguese", () => {
  expect(
    formIssueMessage(
      { code: "custom", message: "Defina uma faixa válida, com máximo maior que mínimo." },
      "Faixa",
    ),
  ).toBe("Defina uma faixa válida, com máximo maior que mínimo.");
  expect(
    formIssueMessage(
      { code: "too_big", message: "Number must be less than 100", maximum: 100, inclusive: false },
      "Taxa na venda (%)",
    ),
  ).toBe("Taxa na venda (%): informe um valor menor que 100.");
  expect(
    formIssueMessage(
      { code: "invalid_type", message: "Expected integer, received float", expected: "integer" },
      "Máximo de compras",
    ),
  ).toBe("Máximo de compras: informe um número inteiro.");
});
