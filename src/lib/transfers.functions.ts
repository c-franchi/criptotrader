import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LOGS_RPCS = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed.bnbchain.org",
  "https://rpc.ankr.com/bsc",
  "https://binance.llamarpc.com",
  "https://bsc-dataseed1.defibit.io",
];
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const CHUNK = 5000;

export type Transfer = { hash: string; block: number; from: string; to: string; amountRaw: string };
export type TransfersResult = {
  transfers: Transfer[];
  source: "bscscan" | "rpc" | null;
  holders: number | null;
  holdersNote: string;
  error: string | null;
  scannedBlocks: number;
};

const cache = new Map<string, { value: TransfersResult; expires: number }>();
const pending = new Map<string, Promise<TransfersResult>>();
let preferred = 0;

async function rpcOnce<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  if (j.result === undefined) throw new Error("sem resposta");
  return j.result as T;
}

/** Tries each public node in turn, starting with the last one that worked. */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let last: unknown;
  for (let i = 0; i < LOGS_RPCS.length; i++) {
    const idx = (preferred + i) % LOGS_RPCS.length;
    try {
      const out = await rpcOnce<T>(LOGS_RPCS[idx]!, method, params);
      preferred = idx;
      return out;
    } catch (e) { last = e; }
  }
  throw new Error(`Todos os servidores públicos falharam (${last instanceof Error ? last.message : "falha"})`);
}

async function fromBscScan(address: string, key: string): Promise<{ list: Transfer[] | null; holders: number | null; note: string }> {
  const base = `https://api.etherscan.io/v2/api?chainid=56&apikey=${key}`;
  const tx = (await (await fetch(`${base}&module=account&action=tokentx&contractaddress=${address}&page=1&offset=15&sort=desc`, { signal: AbortSignal.timeout(8000) })).json()) as {
    status: string; result: unknown;
  };
  if (tx.status !== "1" || !Array.isArray(tx.result)) {
    const msg = typeof tx.result === "string" ? tx.result : "sem resposta";
    return { list: null, holders: null, note: msg.includes("Free API") ? "plano gratuito da BscScan não cobre a BSC" : msg };
  }
  const list = (tx.result as { hash: string; blockNumber: string; from: string; to: string; value: string }[]).map((t) => ({
    hash: t.hash, block: Number(t.blockNumber), from: t.from, to: t.to, amountRaw: t.value,
  }));
  let holders: number | null = null;
  try {
    const h = (await (await fetch(`${base}&module=token&action=tokenholdercount&contractaddress=${address}`)).json()) as { status: string; result: string };
    if (h.status === "1") holders = Number(h.result);
  } catch { /* indisponível */ }
  return { list, holders, note: holders === null ? "contagem exige plano pago da BscScan" : "" };
}

export const getTransfers = createServerFn({ method: "GET" })
  .inputValidator((d: { address: string }) => z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(d))
  .handler(async ({ data }): Promise<TransfersResult> => {
    const key = process.env["BSCSCAN_API_KEY"];
    let holdersNote = "chave da BscScan não configurada";
    if (key) {
      try {
        const b = await fromBscScan(data.address, key);
        holdersNote = b.note;
        if (b.list) return { transfers: b.list, source: "bscscan", holders: b.holders, holdersNote, error: null, scannedBlocks: 0 };
      } catch { holdersNote = "BscScan não respondeu"; }
    }
    try {
      const latest = parseInt(await rpc<string>("eth_blockNumber", []), 16);
      const out: Transfer[] = [];
      let to = latest;
      let scanned = 0;
      for (let i = 0; i < 4 && out.length < 15; i++) {
        const from = to - CHUNK + 1;
        const logs = await rpc<{ transactionHash: string; blockNumber: string; topics: string[]; data: string }[]>("eth_getLogs", [
          { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address: data.address, topics: [TRANSFER] },
        ]);
        for (const l of logs.reverse()) {
          if (l.topics.length < 3) continue;
          out.push({
            hash: l.transactionHash,
            block: parseInt(l.blockNumber, 16),
            from: `0x${l.topics[1]!.slice(26)}`,
            to: `0x${l.topics[2]!.slice(26)}`,
            amountRaw: BigInt(l.data === "0x" ? 0 : l.data).toString(),
          });
        }
        scanned += CHUNK;
        to = from - 1;
      }
      return { transfers: out.slice(0, 15), source: "rpc", holders: null, holdersNote, error: null, scannedBlocks: scanned };
    } catch (e) {
      return { transfers: [], source: null, holders: null, holdersNote, error: e instanceof Error ? e.message : "falha", scannedBlocks: 0 };
    }
  });
