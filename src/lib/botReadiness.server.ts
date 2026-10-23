import type { ReadinessAction, ReadinessIssue } from "./readinessIssues";
import Decimal from "decimal.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- privileged Supabase and viem boundary */
import { formatEther, parseEther, getAddress } from "viem";
import {
  incompatibleBotToken,
  INCOMPATIBLE_BNB,
  gridMarginPct,
  knownFeeConsumesMargin,
} from "./guidedBot";
import { EMPTY_CONFIG, type StrategyConfig } from "./strategy";
import { strategySchema } from "./strategyValidation";
import { grossForNet, hasVerifiedTax } from "./tokens";
import { strategyBuyAmount } from "./walletCapital";
import { readWalletCapital } from "./walletCapital.server";
import { PANCAKE_V2_ROUTER, WBNB, routerAbi, minOut } from "./pancake";
import { pubClient, poolState } from "./bot.server";
import { readMarket } from "./market.server";

export async function readBotReadiness(admin: any, userId: string, scope: string, token: string) {
  const errors: string[] = [],
    warnings: string[] = [];
  const issues: ReadinessIssue[] = [];
  const block = (action: ReadinessAction, message: string) => {
    errors.push(message);
    issues.push({ action, message });
  };
  let liquidityUsd: number | null = null;
  let minLiquidityUsd: number | null = null;
  let feeBnb: number | null = null,
    exchangeCostBnb: number | null = null,
    priceUsd: number | null = null,
    available: string | null = null;
  let version = 0,
    updatedAt: string | null = null,
    botId: string | null = null;
  const result = () => ({
    ready: errors.length === 0,
    errors,
    issues,
    liquidityUsd,
    minLiquidityUsd,
    warnings,
    feeBnb,
    exchangeCostBnb,
    priceUsd,
    available,
    version,
    updatedAt,
    botId,
    at: new Date().toISOString(),
  });
  if (incompatibleBotToken(token)) {
    block("token", INCOMPATIBLE_BNB);
    return result();
  }
  const [b, s, w, l] = await Promise.all([
    admin
      .from("grid_bots")
      .select("*")
      .eq("user_id", userId)
      .eq("wallet_scope", scope)
      .ilike("token", token)
      .is("archived_at", null)
      .maybeSingle(),
    admin
      .from("strategies")
      .select("config,version")
      .eq("user_id", userId)
      .eq("wallet_scope", scope)
      .ilike("token", token)
      .maybeSingle(),
    admin
      .from("bot_wallets")
      .select("address")
      .eq("user_id", userId)
      .eq("wallet_scope", scope)
      .maybeSingle(),
    admin
      .from("bot_execution_locks")
      .select("owner")
      .eq("user_id", userId)
      .eq("wallet_scope", scope)
      .maybeSingle(),
  ]);
  if ([b, s, w, l].some((q) => q.error))
    throw new Error("Não foi possível conferir a configuração e o saldo. Tente novamente.");
  if (!b.data || !s.data) {
    block("rules", "Configure e salve este robô aqui antes de iniciar.");
    return result();
  }
  const bot = b.data;
  botId = bot.id;
  updatedAt = bot.updated_at;
  version = s.data.version;
  const cfg = { ...EMPTY_CONFIG, ...s.data.config } as StrategyConfig;
  minLiquidityUsd = cfg.minLiquidityUsd;
  if (!strategySchema.safeParse(cfg).success)
    block("rules", "As regras salvas precisam de revisão. Abra Configurar robô.");
  if (!w.data) block("fund", "Crie a carteira automática no assistente de configuração.");
  if (l.data)
    block(
      "execution",
      "Uma operação desta carteira está aguardando confirmação. Use Verificar e recuperar.",
    );
  if (!hasVerifiedTax(token, cfg))
    block("fees", "Confirme as taxas da moeda na configuração antes de iniciar.");
  if (!(cfg.buyAmount > 0)) block("values", "Informe um valor por compra maior que zero.");
  if (
    cfg.entryType !== "adaptativa" &&
    !cfg.takeProfits.some((t) => t.pct > 0) &&
    !cfg.trailingEnabled &&
    cfg.stopLossPct <= 0
  )
    block("rules", "Falta definir uma saída automática: meta de venda ou proteção.");
  if (!w.data || errors.length) return result();
  const pub = pubClient();
  const [market, pool, balance, gasPrice] = await Promise.all([
    readMarket(token, process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org", {
      live: true,
    }),
    poolState(getAddress(token)),
    pub.getBalance({ address: getAddress(w.data.address) }),
    pub.getGasPrice(),
  ]);
  const best = market.pools.find(
    (p) => p.supported && p.pairAddress.toLowerCase() === pool?.pair.toLowerCase(),
  );
  liquidityUsd = best?.liquidityUsd ?? null;
  priceUsd = Number(best?.priceUsd) > 0 ? Number(best!.priceUsd) : null;
  if (!pool || !best || !priceUsd)
    block(
      "token",
      "Não há cotação de um par BNB compatível para esta moeda. O gráfico de outro par não permite executar este robô.",
    );
  if (market.error || Date.now() - Date.parse(market.fetchedAt) > 60000)
    block("refresh", "A cotação está desatualizada. Aguarde uma nova leitura antes de iniciar.");
  if (
    Number(bot.strat_state?.tokens ?? 0) <= 0 &&
    (best?.liquidityUsd == null || best.liquidityUsd < cfg.minLiquidityUsd)
  )
    block(
      liquidityUsd == null ? "refresh" : "liquidity",
      `Liquidez do par: ${liquidityUsd == null ? "não apurada" : `US$ ${liquidityUsd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`}. Mínimo exigido: US$ ${cfg.minLiquidityUsd.toLocaleString("pt-BR")}. ${liquidityUsd == null ? "Não foi possível confirmar a liquidez; tente consultar novamente." : "O par está abaixo do mínimo configurado."}`,
    );
  if (gasPrice > BigInt(Math.round(cfg.maxGasGwei * 1e9)))
    block(
      "gas",
      "A taxa da rede está acima do limite configurado. Aguarde ou revise o limite da taxa de rede.",
    );
  const capital = await readWalletCapital(admin, userId, scope, formatEther(balance), bot.id);
  const own = capital.rows.find((r) => r.id === bot.id);
  available = own?.available ?? null;
  const holding = Number(bot.strat_state?.tokens ?? 0) > 0;
  if (!holding && Number(capital.shortfall) > 0)
    block(
      "values",
      "O saldo não cobre o capital e as reservas dos robôs desta carteira. Reduza o limite ou adicione saldo.",
    );
  const amount =
    bot.mode === "grade"
      ? parseEther(new Decimal(bot.order_bnb).toFixed(18, Decimal.ROUND_DOWN))
      : strategyBuyAmount(cfg, own?.available ?? "0", own?.reserved ?? "0");
  if (!holding && (!own || amount <= 0n || amount > parseEther(own.available)))
    block("values", "Não há saldo liberado para a próxima compra deste robô.");
  if (balance === 0n) block("fund", "A carteira está sem BNB para pagar as operações e as taxas.");
  if (errors.length) return result();
  warnings.push(
    "A taxa futura da venda depende da rede e será estimada ao executar. Valores em reais e a posição aberta são estimativas.",
  );
  if (holding) {
    warnings.push(
      "Há uma posição aberta: iniciar retoma as regras atuais, sem substituir a configuração.",
    );
    return result();
  }
  const path = [WBNB, getAddress(token)];
  const amounts = await pub.readContract({
    address: PANCAKE_V2_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [amount, path],
  });
  const bought =
    (amounts.at(-1)! * BigInt(Math.floor((100 - (cfg.buyTaxPct ?? 0)) * 100))) / 10000n;
  const netSold = (bought * BigInt(Math.floor((100 - (cfg.sellTaxPct ?? 0)) * 100))) / 10000n;
  const returned = await pub.readContract({
    address: PANCAKE_V2_ROUTER,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [netSold, [getAddress(token), WBNB]],
  });
  exchangeCostBnb = Math.max(0, Number(formatEther(amount - returned.at(-1)!)));
  try {
    const gas = await pub.estimateContractGas({
      account: getAddress(w.data.address),
      address: PANCAKE_V2_ROUTER,
      abi: routerAbi,
      functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
      args: [
        minOut(bought, cfg.maxSlippagePct),
        path,
        getAddress(w.data.address),
        BigInt(Math.floor(Date.now() / 1000) + 300),
      ],
      value: amount,
    });
    feeBnb = Number(formatEther(gas * gasPrice));
    if (balance < amount + gas * gasPrice)
      block("fund", "O saldo não cobre a compra e a taxa estimada da rede.");
  } catch {
    block(
      "fees",
      "Não foi possível estimar uma compra válida. Confira saldo, taxas da moeda e disponibilidade do contrato. Nada foi enviado.",
    );
  }
  const grossMargin =
    bot.mode === "grade"
      ? ((Number(bot.upper_price) - Number(bot.lower_price)) / bot.levels / (pool?.price || 1)) *
        100
      : cfg.entryType === "adaptativa"
        ? grossForNet(cfg.recovery?.minNetPct ?? 1, {
            buy: cfg.buyTaxPct ?? 0,
            sell: cfg.sellTaxPct ?? 0,
          })
        : Math.min(...cfg.takeProfits.filter((t) => t.pct > 0).map((t) => t.pct));
  if (!Number.isFinite(grossMargin))
    warnings.push("A saída depende da proteção configurada; não há meta fixa de lucro.");
  else if (
    knownFeeConsumesMargin(
      Number(formatEther(amount)),
      ((Number(formatEther(returned.at(-1)!)) * (1 + grossMargin / 100)) /
        Number(formatEther(amount)) -
        1) *
        100,
      feeBnb,
    )
  )
    block(
      bot.mode === "grade" ? "range" : "costs",
      "Os custos já estimados consomem a margem desta operação. Aumente o espaçamento/meta ou revise o valor; a taxa da venda ainda pode aumentar esse custo.",
    );
  if (
    bot.mode === "grade" &&
    gridMarginPct(
      Number(bot.lower_price),
      Number(bot.upper_price),
      bot.levels,
      pool!.price,
      cfg.buyTaxPct ?? 0,
      cfg.sellTaxPct ?? 0,
    ) <= 0
  )
    block("range", "O espaçamento da faixa não cobre as taxas informadas da moeda.");
  return result();
}
