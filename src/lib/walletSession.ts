export type ReadableWalletSession = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
export type WalletSession = { account: string | null; chain: number | null };
export async function readWalletSession(provider: ReadableWalletSession): Promise<WalletSession> {
  const [accounts, chain] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  return {
    account: Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null,
    chain: chain != null && Number.isFinite(Number(chain)) ? Number(chain) : null,
  };
}
export function walletSessionIssue(
  session: WalletSession,
  expected?: string | null,
): string | null {
  if (!session.account) return "Conecte a carteira que contém os ativos antes de enviar.";
  if (expected && session.account.toLowerCase() !== expected.toLowerCase())
    return `Conta diferente da carteira dos ativos. Você está conectado a outra carteira. Na Trust Wallet ou no aplicativo usado, selecione ${expected.slice(0, 6)}…${expected.slice(-4)} e conecte novamente.`;
  if (session.chain !== 56)
    return "Rede incorreta ou não confirmada. Selecione BNB Smart Chain (56) no aplicativo da carteira e reconecte.";
  return null;
}
/** Check the live provider immediately before a request, not a cached UI account. */
export async function verifyWalletSession(provider: ReadableWalletSession, expected: string) {
  const issue = walletSessionIssue(await readWalletSession(provider), expected);
  if (issue) throw new Error(issue);
}
