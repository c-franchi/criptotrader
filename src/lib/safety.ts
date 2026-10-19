import { toFunctionSelector } from "viem";

/** Robot never buys into a pool below this USD liquidity, even if the strategy allows less. */
export const ROBOT_MIN_LIQUIDITY_USD = 2000;

/** Returns a block reason for a robot buy, or null when liquidity is safe. Unknown liquidity blocks. */
export function liquidityBlock(liquidityUsd: number | null | undefined, strategyMin = 0): string | null {
  const floor = Math.max(ROBOT_MIN_LIQUIDITY_USD, strategyMin || 0);
  if (liquidityUsd == null || !Number.isFinite(liquidityUsd)) return "Compra bloqueada por segurança: liquidez do pool indisponível agora";
  if (liquidityUsd < floor) return `Compra bloqueada por segurança: liquidez do pool US$ ${Math.round(liquidityUsd)} abaixo do mínimo de US$ ${floor}`;
  return null;
}

export type SlippageLevel = "ok" | "cautela" | "critico";
export function slippageLevel(pct: number): SlippageLevel {
  if (pct > 12) return "critico";
  if (pct > 5) return "cautela";
  return "ok";
}

/** Risky contract functions searched in the bytecode (selector match = function exists). */
const RISKY: { sig: string; label: string; severity: "alto" | "medio" }[] = [
  { sig: "mint(address,uint256)", label: "Pode criar novos tokens (mint)", severity: "alto" },
  { sig: "mint(uint256)", label: "Pode criar novos tokens (mint)", severity: "alto" },
  { sig: "blacklist(address)", label: "Pode bloquear carteiras (blacklist)", severity: "alto" },
  { sig: "addToBlacklist(address)", label: "Pode bloquear carteiras (blacklist)", severity: "alto" },
  { sig: "setBlacklist(address,bool)", label: "Pode bloquear carteiras (blacklist)", severity: "alto" },
  { sig: "addBot(address)", label: "Pode bloquear carteiras (lista de bots)", severity: "alto" },
  { sig: "setBots(address[],bool)", label: "Pode bloquear carteiras (lista de bots)", severity: "alto" },
  { sig: "pause()", label: "Pode pausar todas as transferências", severity: "alto" },
  { sig: "setTradingEnabled(bool)", label: "Pode ligar/desligar negociações", severity: "alto" },
  { sig: "setFee(uint256)", label: "Dono pode alterar a taxa", severity: "medio" },
  { sig: "setFees(uint256,uint256)", label: "Dono pode alterar a taxa", severity: "medio" },
  { sig: "setTaxFeePercent(uint256)", label: "Dono pode alterar a taxa", severity: "medio" },
  { sig: "setBuyFee(uint256)", label: "Dono pode alterar a taxa de compra", severity: "medio" },
  { sig: "setSellFee(uint256)", label: "Dono pode alterar a taxa de venda", severity: "medio" },
  { sig: "setMaxTxAmount(uint256)", label: "Dono pode limitar o tamanho das vendas", severity: "medio" },
  { sig: "upgradeTo(address)", label: "Contrato pode ser trocado (proxy)", severity: "alto" },
];

export type ContractRisk = { label: string; severity: "alto" | "medio" };

/** Pure bytecode scan: PUSH4 <selector> appears in the dispatcher of compiled Solidity contracts. */
export function scanBytecode(code: string): ContractRisk[] {
  const c = code.toLowerCase().replace(/^0x/, "");
  const seen = new Set<string>();
  const out: ContractRisk[] = [];
  for (const r of RISKY) {
    const sel = toFunctionSelector(r.sig).slice(2);
    if (c.includes("63" + sel) && !seen.has(r.label)) { seen.add(r.label); out.push({ label: r.label, severity: r.severity }); }
  }
  return out;
}
