import { createPublicClient, createWalletClient, formatEther, getAddress, http, parseEther, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { PANCAKE_V2_FACTORY, PANCAKE_V2_ROUTER, WBNB, ZERO, erc20Abi, factoryAbi, minOut, pairAbi, priceImpactPct, routerAbi } from "./pancake";
import { gridDecision } from "./grid";
import { findToken } from "./tokens";

const RPC = () => process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org";
export const pubClient = () => createPublicClient({ chain: bsc, transport: http(RPC()) });

async function aesKey() {
  const s = process.env["BOT_KEY_SECRET"];
  if (!s) throw new Error("Chave de criptografia ausente");
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function newEncryptedWallet() {
  const pk = generatePrivateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(pk)));
  return { address: privateKeyToAccount(pk).address, enc_key: `${b64(iv)}.${b64(ct)}` };
}

async function decryptKey(enc: string) {
  const [iv, ct] = enc.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, await aesKey(), unb64(ct!));
  return new TextDecoder().decode(pt) as `0x${string}`;
}

export async function botSigner(enc: string) {
  const account = privateKeyToAccount(await decryptKey(enc));
  return { account, wallet: createWalletClient({ account, chain: bsc, transport: http(RPC()) }) };
}

export async function poolState(token: `0x${string}`) {
  const pub = pubClient();
  const pair = await pub.readContract({ address: PANCAKE_V2_FACTORY, abi: factoryAbi, functionName: "getPair", args: [token, WBNB] });
  if (pair === ZERO) return null;
  const [[r0, r1], t0] = await Promise.all([
    pub.readContract({ address: pair, abi: pairAbi, functionName: "getReserves" }),
    pub.readContract({ address: pair, abi: pairAbi, functionName: "token0" }),
  ]);
  const is0 = t0.toLowerCase() === token.toLowerCase();
  const tok = is0 ? r0 : r1, bnb = is0 ? r1 : r0;
  const dec = findToken(token)?.decimals ?? 18;
  const price = Number(formatEther(bnb)) / (Number(tok) / 10 ** dec); // BNB por token
  return { pair, tok, bnb, price };
}

type Bot = {
  id: string; user_id: string; token: string; lower_price: number; upper_price: number; levels: number;
  order_bnb: number; max_slippage_pct: number; max_impact_pct: number; gas_reserve_bnb: number; last_level: number | null;
};

/** Runs one grid step for a bot. Executes at most one swap; returns a patch for grid_bots plus an order row (if any). */
export async function runGridStep(bot: Bot, enc: string) {
  const token = getAddress(bot.token);
  const pool = await poolState(token);
  if (!pool) return { patch: { last_error: "Pool inexistente" }, order: null };
  const d = gridDecision(pool.price, Number(bot.lower_price), Number(bot.upper_price), bot.levels, bot.last_level);
  const patch: { last_price?: number; last_level?: number | null; last_error?: string | null } = { last_price: pool.price, last_level: d.level, last_error: null };
  if (d.action === "nenhuma") return { patch, order: null };

  const pub = pubClient();
  const { account, wallet } = await botSigner(enc);
  const me = account.address;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const reserve = parseEther(String(bot.gas_reserve_bnb));
  const bnbBal = await pub.getBalance({ address: me });
  const dec = findToken(token)?.decimals ?? 18;
  const bnbWanted = parseEther(String(Number(bot.order_bnb) * d.steps));
  let amountIn: bigint, path: `0x${string}`[];

  if (d.action === "compra") {
    amountIn = bnbWanted;
    if (amountIn + reserve > bnbBal) return { patch: { ...patch, last_level: bot.last_level, last_error: "BNB insuficiente para comprar" }, order: null };
    path = [WBNB, token];
    if (priceImpactPct(amountIn, pool.bnb) > bot.max_impact_pct) return { patch: { ...patch, last_level: bot.last_level, last_error: "Impacto de preço acima do limite" }, order: null };
  } else {
    if (bnbBal < reserve) return { patch: { ...patch, last_level: bot.last_level, last_error: "BNB insuficiente para gas" }, order: null };
    const tokBal = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [me] });
    const want = parseUnits((Number(bot.order_bnb) * d.steps / pool.price).toFixed(dec > 8 ? 8 : dec), dec);
    amountIn = want > tokBal ? tokBal : want;
    if (amountIn === 0n) return { patch: { ...patch, last_error: "Sem tokens para vender" }, order: null };
    path = [token, WBNB];
    if (priceImpactPct(amountIn, pool.tok) > bot.max_impact_pct) return { patch: { ...patch, last_level: bot.last_level, last_error: "Impacto de preço acima do limite" }, order: null };
    const allowance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [me, PANCAKE_V2_ROUTER] });
    if (allowance < amountIn) {
      const ah = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [PANCAKE_V2_ROUTER, amountIn] });
      await pub.waitForTransactionReceipt({ hash: ah });
    }
  }
  const amounts = await pub.readContract({ address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, path] });
  const quoted = amounts[amounts.length - 1]!;
  const min = minOut(quoted, Number(bot.max_slippage_pct));
  const order = {
    user_id: bot.user_id, side: d.action, wallet: me, pair_address: pool.pair, token, source: "grade",
    amount_in: amountIn.toString(), amount_out_min: min.toString(), quoted_out: quoted.toString(),
    slippage_pct: Number(bot.max_slippage_pct), deadline: Number(deadline), status: "enviada",
    tx_hash: null as string | null, block_number: null as number | null, error: null as string | null,
  };
  try {
    const hash = d.action === "compra"
      ? await wallet.writeContract({ address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens", args: [min, path, me, deadline], value: amountIn })
      : await wallet.writeContract({ address: PANCAKE_V2_ROUTER, abi: routerAbi, functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens", args: [amountIn, min, path, me, deadline] });
    order.tx_hash = hash;
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 45_000 });
    order.status = r.status === "success" ? "confirmada" : "falhou";
    order.block_number = Number(r.blockNumber);
    if (r.status !== "success") patch.last_level = bot.last_level;
  } catch (e) {
    order.status = "falhou";
    order.error = ((e as Error).message ?? "erro").split("\n")[0]!.slice(0, 300);
    patch.last_level = bot.last_level;
    patch.last_error = order.error;
  }
  return { patch, order };
}
