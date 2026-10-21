import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import {
  PANCAKE_V2_FACTORY,
  PANCAKE_V2_ROUTER,
  WBNB,
  ZERO,
  erc20Abi,
  factoryAbi,
  minOut,
  pairAbi,
  priceImpactPct,
  routerAbi,
} from "./pancake";
import { contractTransaction, settleSubmission } from "./submission.server";
import { gridDecision } from "./grid";
import { tokenMeta } from "./tokenMeta.server";
import { taxFor } from "./tokens";

const RPC = () => process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org";
export const pubClient = () =>
  createPublicClient({ chain: bsc, transport: http(RPC(), { timeout: 8000, retryCount: 1 }) });

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
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aesKey(),
      new TextEncoder().encode(pk),
    ),
  );
  return { address: privateKeyToAccount(pk).address, enc_key: `${b64(iv)}.${b64(ct)}` };
}

async function decryptKey(enc: string) {
  const [iv, ct] = enc.split(".");
  if (!iv || !ct) throw new Error("Carteira criptografada inválida");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    await aesKey(),
    unb64(ct),
  );
  return new TextDecoder().decode(pt) as `0x${string}`;
}

export async function botSigner(enc: string) {
  const account = privateKeyToAccount(await decryptKey(enc));
  return {
    account,
    wallet: createWalletClient({
      account,
      chain: bsc,
      transport: http(RPC(), { timeout: 8000, retryCount: 1 }),
    }),
  };
}

export async function poolState(token: `0x${string}`) {
  const pub = pubClient();
  const pair = await pub.readContract({
    address: PANCAKE_V2_FACTORY,
    abi: factoryAbi,
    functionName: "getPair",
    args: [token, WBNB],
  });
  if (pair === ZERO) return null;
  const [[r0, r1], t0] = await Promise.all([
    pub.readContract({ address: pair, abi: pairAbi, functionName: "getReserves" }),
    pub.readContract({ address: pair, abi: pairAbi, functionName: "token0" }),
  ]);
  const is0 = t0.toLowerCase() === token.toLowerCase();
  const tok = is0 ? r0 : r1,
    bnb = is0 ? r1 : r0;
  const dec = (await tokenMeta(token)).decimals;
  const price = Number(formatEther(bnb)) / (Number(tok) / 10 ** dec); // BNB por token
  return { pair, tok, bnb, price };
}

type Bot = {
  id: string;
  user_id: string;
  token: string;
  lower_price: number;
  upper_price: number;
  levels: number;
  order_bnb: number;
  max_slippage_pct: number;
  max_impact_pct: number;
  gas_reserve_bnb: number;
  last_level: number | null;
  strat_state: unknown;
};

/** Runs one grid step for a bot. Executes at most one swap; returns a patch for grid_bots plus an order row (if any). */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function runGridStep(
  bot: Bot,
  enc: string,
  admin: any,
  owner: string,
  analysisOnly = false,
) {
  const token = getAddress(bot.token);
  const pool = await poolState(token);
  if (!pool) return { patch: { last_error: "Pool inexistente" }, order: null };
  const d = gridDecision(
    pool.price,
    Number(bot.lower_price),
    Number(bot.upper_price),
    bot.levels,
    bot.last_level,
  );
  const patch: { last_price?: number; last_level?: number | null; last_error?: string | null } = {
    last_price: pool.price,
    last_level:
      d.action === "nenhuma"
        ? d.level
        : (bot.last_level ?? d.level) + (d.action === "compra" ? -1 : 1),
    last_error: null,
  };
  if (analysisOnly)
    return {
      patch: {
        last_price: pool.price,
        last_reason:
          pool.price < Number(bot.lower_price) || pool.price > Number(bot.upper_price)
            ? "Preço fora da faixa: grade pausada até retornar"
            : `Grade: ${d.action} · nível ${d.level}. Prévia sem envio de ordem.`,
        last_error: null,
      },
      order: null,
    };
  if (d.action === "nenhuma") return { patch, order: null };

  const pub = pubClient();
  const { account, wallet } = await botSigner(enc);
  const me = account.address;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  if (pool.price < Number(bot.lower_price) || pool.price > Number(bot.upper_price))
    return {
      patch: { last_error: "Preço fora da faixa: grade pausada até retornar" },
      order: null,
    };
  const reserve = parseEther(String(bot.gas_reserve_bnb));
  const bnbBal = await pub.getBalance({ address: me });
  const dec = (await tokenMeta(token)).decimals;
  // One installment per tick even if multiple bands were crossed.
  const steps = Math.min(d.steps, 1);
  const { data: strategy } = await admin
    .from("strategies")
    .select("config")
    .eq("user_id", bot.user_id)
    .ilike("token", token)
    .maybeSingle();
  const { hasVerifiedTax } = await import("./tokens");
  if (!hasVerifiedTax(token, strategy?.config))
    return {
      patch: { last_error: "Confirme as taxas do token na estratégia antes de automatizar" },
      order: null,
    };
  const { normalizeState } = await import("./autoStrategy");
  const state = normalizeState(bot.strat_state, Date.now());
  const cap = Number(strategy?.config?.allocationBnb || strategy?.config?.maxExposureQuote || 0);
  if (d.action === "compra" && cap > 0 && state.costBnb + Number(bot.order_bnb) > cap)
    return { patch: { last_error: "Limite de capital da grade atingido" }, order: null };
  const bnbWanted = parseEther(Number(bot.order_bnb).toFixed(18));
  let amountIn: bigint, path: `0x${string}`[];

  if (d.action === "compra") {
    const { readMarket } = await import("./market.server");
    const { liquidityBlock } = await import("./safety");
    const market = await readMarket(token, RPC());
    const liq = market.pools.find(
      (p) => p.pairAddress.toLowerCase() === pool.pair.toLowerCase(),
    )?.liquidityUsd;
    const blocked = liquidityBlock(liq, Number(strategy?.config?.minLiquidityUsd ?? 0));
    if (blocked || market.error)
      return { patch: { last_error: blocked ?? "Mercado indisponível" }, order: null };
    amountIn = bnbWanted;
    if (amountIn + reserve > bnbBal)
      return {
        patch: {
          ...patch,
          last_level: bot.last_level,
          last_error: "BNB insuficiente para comprar",
        },
        order: null,
      };
    path = [WBNB, token];
    if (priceImpactPct(amountIn, pool.bnb) > bot.max_impact_pct)
      return {
        patch: {
          ...patch,
          last_level: bot.last_level,
          last_error: "Impacto de preço acima do limite",
        },
        order: null,
      };
  } else {
    if (bnbBal < reserve)
      return {
        patch: { ...patch, last_level: bot.last_level, last_error: "BNB insuficiente para gas" },
        order: null,
      };
    const tokBal = await pub.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [me],
    });
    const want = parseUnits(
      ((Number(bot.order_bnb) * steps) / pool.price).toFixed(dec > 8 ? 8 : dec),
      dec,
    );
    amountIn = want > tokBal ? tokBal : want;
    if (amountIn === 0n)
      return { patch: { ...patch, last_error: "Sem tokens para vender" }, order: null };
    path = [token, WBNB];
    if (priceImpactPct(amountIn, pool.tok) > bot.max_impact_pct)
      return {
        patch: {
          ...patch,
          last_level: bot.last_level,
          last_error: "Impacto de preço acima do limite",
        },
        order: null,
      };
    if (
      !(await approveForSwap({
        admin,
        owner,
        pub,
        wallet,
        me,
        token,
        amountIn,
        userId: bot.user_id,
      }))
    )
      return {
        patch: { last_error: "Aprovação pendente — aguardando confirmação" },
        order: { status: "enviada", side: "venda" },
      };
  }
  const tax = taxFor(token, strategy?.config);
  const res = await sendSwap({
    pub,
    wallet,
    me,
    token,
    side: d.action,
    amountIn,
    path,
    slippagePct: Number(bot.max_slippage_pct),
    taxPct: d.action === "compra" ? tax.buy : tax.sell,
    userId: bot.user_id,
    pair: pool.pair,
    source: "grade",
    admin,
    owner,
    intent: {
      botId: bot.id,
      mode: "grade",
      nextLevel: patch.last_level,
      state,
      decimals: dec,
      priceBnb: pool.price,
    },
    maxGasGwei: Number(strategy?.config?.maxGasGwei ?? 5),
  });
  if (res.order.status !== "confirmada") {
    patch.last_level = bot.last_level;
    if (res.order.error) patch.last_error = res.order.error;
  }
  const order = res.order;
  // The journal transaction already updated last_level when confirmed.
  delete patch.last_level;
  return { patch, order };
}

type Pub = ReturnType<typeof pubClient>;
type Wal = Awaited<ReturnType<typeof botSigner>>["wallet"];

/** Sends one swap with the robot wallet. Min out discounts the token tax and slippage. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function approveForSwap(o: {
  admin: any;
  owner: string;
  pub: Pub;
  wallet: Wal;
  me: `0x${string}`;
  token: `0x${string}`;
  amountIn: bigint;
  userId: string;
  maxGasGwei?: number;
}) {
  const allowance = await o.pub.readContract({
    address: o.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [o.me, PANCAKE_V2_ROUTER],
  });
  if (allowance >= o.amountIn) return true;
  const r = await contractTransaction({
    ...o,
    to: o.token,
    abi: erc20Abi,
    functionName: "approve",
    args: [PANCAKE_V2_ROUTER, o.amountIn],
    intent: { kind: "approval", token: o.token, wallet: o.me },
  });
  if (!r.receipt) return false;
  await settleSubmission(
    o.admin,
    o.pub,
    { id: r.id, intent: { kind: "approval" }, tx_hash: r.hash },
    r.receipt,
  );
  if (r.receipt.status !== "success") throw new Error("Aprovação revertida; swap não enviado");
  return true;
}

export async function sendSwap(o: {
  pub: Pub;
  wallet: Wal;
  me: `0x${string}`;
  token: `0x${string}`;
  side: "compra" | "venda";
  amountIn: bigint;
  path: `0x${string}`[];
  slippagePct: number;
  taxPct: number;
  userId: string;
  pair: string;
  source: string;
  admin: any;
  owner: string;
  intent: Record<string, any>;
  maxGasGwei?: number;
}) {
  const { pub, wallet, me, token, path, amountIn } = o;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const amounts = await pub.readContract({
    address: PANCAKE_V2_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [amountIn, path],
  });
  const gross = amounts.at(-1);
  if (gross == null) throw new Error("Cotação indisponível");
  const net =
    (gross * BigInt(Math.round((100 - Math.min(Math.max(o.taxPct, 0), 99)) * 100))) / 10000n;
  const min = minOut(net, o.slippagePct);
  const order = {
    user_id: o.userId,
    side: o.side,
    wallet: me,
    pair_address: o.pair,
    token,
    source: o.source,
    amount_in: amountIn.toString(),
    amount_out_min: min.toString(),
    quoted_out: net.toString(),
    slippage_pct: o.slippagePct,
    deadline: Number(deadline),
    status: "enviada",
    tx_hash: null as string | null,
    error: null as string | null,
  };
  const { data: approvals, error: approvalsError } = await o.admin
    .from("execution_submissions")
    .select("receipt")
    .eq("lock_owner", o.owner)
    .contains("intent", { kind: "approval" })
    .not("finished_at", "is", null);
  if (approvalsError) throw new Error("Não foi possível consultar os custos de aprovação");
  const approvalGasRaw = (approvals ?? [])
    .reduce(
      (sum: bigint, a: { receipt: { gasBnb?: string } }) =>
        sum + parseEther(a.receipt?.gasBnb ?? "0"),
      0n,
    )
    .toString();
  const intent = {
    ...o.intent,
    approvalGasRaw,
    kind: "swap",
    token,
    wallet: me,
    side: o.side,
    amountIn: amountIn.toString(),
    quotedOut: net.toString(),
    order,
  };
  const r = await contractTransaction({
    admin: o.admin,
    owner: o.owner,
    userId: o.userId,
    pub,
    wallet,
    to: PANCAKE_V2_ROUTER,
    abi: routerAbi,
    functionName:
      o.side === "compra"
        ? "swapExactETHForTokensSupportingFeeOnTransferTokens"
        : "swapExactTokensForETHSupportingFeeOnTransferTokens",
    args: o.side === "compra" ? [min, path, me, deadline] : [amountIn, min, path, me, deadline],
    ...(o.side === "compra" ? { value: amountIn } : {}),
    intent,
    ...(o.maxGasGwei ? { maxGasGwei: o.maxGasGwei } : {}),
  });
  order.tx_hash = r.hash;
  if (r.receipt) {
    await settleSubmission(o.admin, pub, { id: r.id, intent, tx_hash: r.hash }, r.receipt);
    order.status = r.receipt.status === "success" ? "confirmada" : "falhou";
    if (order.status === "falhou") order.error = "Transação revertida";
  } else order.error = "Confirmação pendente — não repetir até conciliar";
  return { order, net };
}
