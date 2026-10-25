export type ReadableWalletSession = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
/** Check the live provider immediately before a request, not a cached UI account. */
export async function verifyWalletSession(provider: ReadableWalletSession, expected: string) {
  const [accounts, chain] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string" ||
    accounts[0].toLowerCase() !== expected.toLowerCase()
  )
    throw new Error(
      `Conta diferente da carteira dos ativos. Selecione ${expected.slice(0, 6)}…${expected.slice(-4)} no aplicativo da carteira e reconecte.`,
    );
  if (Number(chain) !== 56)
    throw new Error("Selecione BNB Smart Chain (56) no aplicativo da carteira.");
}
