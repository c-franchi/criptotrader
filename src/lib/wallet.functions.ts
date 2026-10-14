import { createServerFn } from "@tanstack/react-start";

// The WalletConnect project ID is a public identifier; served at runtime so it isn't hardcoded.
export const getWalletConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { projectId: process.env["WALLETCONNECT_PROJECT_ID"] ?? null };
});
