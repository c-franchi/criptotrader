import { getWalletConfig } from "./wallet.functions";

type Provider = Awaited<
  ReturnType<typeof import("@walletconnect/ethereum-provider").EthereumProvider.init>
>;

// One WalletConnect client for the whole app: two clients sharing the same storage
// make the wallet reject requests ("Unknown method(s) requested").
let providerPromise: Promise<Provider> | null = null;

export function getWalletProvider(): Promise<Provider> {
  if (!providerPromise) {
    providerPromise = (async () => {
      const { projectId } = await getWalletConfig();
      if (!projectId) throw new Error("Conexão de carteira não configurada");
      const { Buffer } = await import("buffer");
      (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer ??= Buffer;
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      return EthereumProvider.init({
        projectId,
        chains: [56],
        showQrModal: true,
        optionalMethods: [
          "eth_sendTransaction",
          "personal_sign",
          "eth_signTypedData_v4",
          "wallet_switchEthereumChain",
        ],
        metadata: {
          name: "CryptoBot",
          description: "Robô e operações na BSC",
          url: window.location.origin,
          icons: [`${window.location.origin}/icon-192.png`],
          redirect: { universal: window.location.href },
        },
      });
    })().catch((e) => {
      providerPromise = null;
      throw e;
    });
  }
  return providerPromise;
}

/** Connects (or reuses a healthy session). Stale sessions that can't send transactions are dropped. */
export async function connectWallet(): Promise<Provider> {
  const p = await getWalletProvider();
  const methods = p.session?.namespaces?.["eip155"]?.methods ?? [];
  if (p.session && (!methods.includes("eth_sendTransaction") || !p.accounts[0])) {
    await p.disconnect().catch(() => {});
  }
  if (!p.session) await p.connect();
  return p;
}

export async function resetWallet() {
  if (!providerPromise) return;
  const p = await providerPromise.catch(() => null);
  await p?.disconnect().catch(() => {});
}

export const isUnknownMethod = (e: unknown) =>
  /unknown method|unsupported method|not authorized/i.test((e as Error)?.message ?? "");
