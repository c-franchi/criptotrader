import { sharedRead } from "./sharedReads.server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPublicClient, custom, http, type Transport } from "viem";
import { bsc } from "viem/chains";
type Call = { method: string; params?: any };
type Node = { alias: string; request: (call: Call) => Promise<any> };
const READS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_call",
  "eth_estimateGas",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getCode",
]);
/** Bounded read failover only. Broadcasting/signing and trace requests never move to another provider. */
export class RobotRpcRouter {
  readonly stats: {
    alias: string;
    requests: number;
    failures: number;
    lastMs: number | null;
    checkedAt: number | null;
    blockedUntil: number;
    chainUntil: number;
  }[];
  private checking = new Map<number, Promise<void>>();
  constructor(
    private nodes: Node[],
    private now = () => Date.now(),
  ) {
    this.stats = nodes.map((n) => ({
      alias: n.alias,
      requests: 0,
      failures: 0,
      lastMs: null,
      checkedAt: null,
      blockedUntil: 0,
      chainUntil: 0,
    }));
  }
  private async chain(index: number) {
    if (this.stats[index]!.chainUntil > this.now()) return;
    let pending = this.checking.get(index);
    if (!pending) {
      pending = (async () => {
        if (Number(await this.nodes[index]!.request({ method: "eth_chainId" })) !== 56)
          throw new Error("Rede incorreta");
        this.stats[index]!.chainUntil = this.now() + 60000;
      })();
      this.checking.set(index, pending);
    }
    try {
      await pending;
    } finally {
      this.checking.delete(index);
    }
  }
  async request(call: Call): Promise<any> {
    if (!READS.has(call.method)) return this.nodes[0]!.request(call);
    const candidates = this.nodes
      .map((_, i) => i)
      .sort(
        (a, b) =>
          Number(this.stats[a]!.blockedUntil > this.now()) -
          Number(this.stats[b]!.blockedUntil > this.now()),
      );
    for (const index of candidates) {
      const stat = this.stats[index]!,
        start = this.now();
      stat.requests++;
      try {
        await this.chain(index);
        const result = await this.nodes[index]!.request(call);
        if (call.method === "eth_getBlockByNumber" && call.params?.[0] === "latest") {
          const age = this.now() - Number(result?.timestamp) * 1000;
          if (!Number.isFinite(age) || age > 15000 || age < -5000)
            throw new Error("Bloco desatualizado");
        }
        stat.lastMs = Math.max(0, this.now() - start);
        stat.checkedAt = this.now();
        stat.blockedUntil = 0;
        return result;
      } catch (e) {
        // A contract revert is not a provider outage; do not try to bypass it at another node.
        if ((e as any)?.code === 3 || /execution reverted/i.test((e as Error)?.message ?? ""))
          throw e;
        stat.failures++;
        stat.checkedAt = this.now();
        stat.blockedUntil = this.now() + 10000;
      }
    }
    throw new Error(
      "Consulta BSC indisponível nos provedores verificados. Aguarde nova leitura; nenhuma cotação antiga foi usada como atual.",
    );
  }
  snapshot() {
    return this.stats.map(({ alias, requests, failures, lastMs, checkedAt }) => ({
      alias,
      requests,
      failures,
      lastMs,
      checkedAt,
    }));
  }
}
const routers = new Map<string, RobotRpcRouter>();
export function rpcUrls(primary?: string) {
  return [
    ...new Set([
      primary || process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org",
      process.env["BSC_RPC_FALLBACK_URL"] || "https://bsc-dataseed-public.bnbchain.org",
    ]),
  ];
}
export function rpcRouter(primary?: string, allowFallback = true) {
  const urls = allowFallback ? rpcUrls(primary) : [primary || rpcUrls()[0]!],
    key = urls.join("|");
  let router = routers.get(key);
  if (!router) {
    router = new RobotRpcRouter(
      urls.map((url, i) => {
        const fast = http(url, { timeout: 2500, retryCount: 0 })({ chain: bsc, retryCount: 0 })
          .request as any;
        const trace = http(url, { timeout: 8000, retryCount: 0 })({ chain: bsc, retryCount: 0 })
          .request as any;
        return {
          alias: i === 0 ? "Principal" : "Alternativo",
          request: (call: Call) => (call.method.startsWith("debug_") ? trace(call) : fast(call)),
        };
      }),
    );
    if (routers.size > 10) routers.clear();
    routers.set(key, router);
  }
  return router;
}
export function robotRpcTransport(primary?: string, allowFallback = true): Transport {
  const router = rpcRouter(primary, allowFallback);
  return custom({ request: (call) => router.request(call) }, { retryCount: 0 });
}
export async function probeRobotRpc() {
  // Independent probes are read-only and return aliases, never API-key-bearing URLs.
  return Promise.all(
    rpcUrls().map(async (url, i) => {
      const start = Date.now(),
        alias = i === 0 ? "Principal" : "Alternativo";
      try {
        const request = http(url, { timeout: 2500, retryCount: 0 })({
          chain: bsc,
          retryCount: 0,
        }).request;
        const [chain, block] = await Promise.all([
          request({ method: "eth_chainId" }),
          request({ method: "eth_getBlockByNumber", params: ["latest", false] }),
        ]);
        const ageMs =
          Date.now() - Number((block as { timestamp?: string } | null)?.timestamp) * 1000;
        return {
          alias,
          ok: Number(chain) === 56 && ageMs >= -5000 && ageMs <= 15000,
          durationMs: Date.now() - start,
          blockAgeMs: Number.isFinite(ageMs) ? ageMs : null,
          at: new Date().toISOString(),
        };
      } catch {
        return {
          alias,
          ok: false,
          durationMs: Date.now() - start,
          blockAgeMs: null,
          at: new Date().toISOString(),
        };
      }
    }),
  );
}

/** Entire price snapshot stays on one provider and one block. Retry the read-only snapshot as a whole. */
export async function withRpcSnapshot<T>(
  primary: string,
  read: (client: any, block: { number: bigint; timestamp: bigint }, endpoint: string) => Promise<T>,
): Promise<T> {
  for (const endpoint of rpcUrls(primary)) {
    try {
      const client = createPublicClient({
        chain: bsc,
        transport: robotRpcTransport(endpoint, false),
      });
      const block = await sharedRead(`latest-block:${endpoint}`, 300, () =>
        client.getBlock({ blockTag: "latest" }),
      );
      const age = Date.now() - Number(block.timestamp) * 1000;
      if (!Number.isFinite(age) || age > 15000 || age < -5000) throw new Error("Bloco antigo");
      return await read(client, block, endpoint);
    } catch (e) {
      if ((e as any)?.code === 3 || /execution reverted/i.test((e as Error)?.message ?? ""))
        throw e;
    }
  }
  throw new Error("Não foi possível obter uma cotação consistente de um bloco BSC recente.");
}
