import { formatUnits } from "viem";
type Metadata = { address: string; symbol: string; decimals: number };
export function withdrawalHistoryRow(
  row: {
    id: string;
    tx_hash: string;
    created_at: string;
    finished_at: string | null;
    intent: unknown;
    receipt: unknown;
  },
  metadata: Metadata[],
  from?: string,
) {
  const i = (row.intent ?? {}) as Record<string, unknown>,
    r = (row.receipt ?? {}) as Record<string, unknown>;
  const token = typeof i["token"] === "string" ? i["token"] : null;
  const known = metadata.find((t) => t.address.toLowerCase() === token?.toLowerCase());
  const decimals = token
    ? typeof i["decimals"] === "number"
      ? i["decimals"]
      : known?.decimals
    : 18;
  const amount = (raw: unknown) => {
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
    if (decimals == null || decimals < 0 || decimals > 255)
      return `${raw} unidades brutas (decimais não apurados)`;
    return formatUnits(BigInt(raw), decimals);
  };
  return {
    id: row.id,
    hash: row.tx_hash,
    createdAt: row.created_at,
    from: typeof i["from"] === "string" ? i["from"] : (from ?? null),
    to: typeof i["to"] === "string" ? i["to"] : null,
    token,
    symbol: token
      ? typeof i["symbol"] === "string"
        ? i["symbol"]
        : (known?.symbol ?? `${token.slice(0, 6)}…${token.slice(-4)}`)
      : "BNB",
    amount: amount(i["amount"]),
    received:
      r["status"] === "success"
        ? token
          ? amount(r["receivedTokenRaw"])
          : amount(i["amount"])
        : null,
    status:
      r["status"] === "success" && row.finished_at
        ? "confirmada"
        : r["status"] === "reverted" && row.finished_at
          ? "revertida"
          : "pendente",
    gasBnb: typeof r["gasBnb"] === "string" ? r["gasBnb"] : null,
  };
}
