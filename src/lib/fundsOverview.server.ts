/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatEther, formatUnits, getAddress } from "viem";
import { POPULAR_BSC_TOKENS } from "./tokens";
import { erc20Abi } from "./pancake";
import { uniqueFundWallets, type FundWallet, type FundAsset } from "./fundsOverview";
import { walletCapital } from "./walletCapital";
import { LEGACY_WALLET_SCOPE } from "./walletScope";
import type { StrategyConfig } from "./strategy";

/** Read only public addresses and scoped configuration; never select wallet signing material. */
export async function readFundsOverview(admin: any, pub: any, userId: string) {
  const [saved, robots, added, bots, strategies, locks, pending] = await Promise.all([
    admin.from("user_wallets").select("id,address,label").eq("user_id", userId).limit(1000),
    admin.from("bot_wallets").select("address,wallet_scope").eq("user_id", userId).limit(1000),
    admin.from("user_tokens").select("address").eq("user_id", userId).limit(1000),
    admin
      .from("grid_bots")
      .select("id,token,wallet_scope,armed,mode,order_bnb,gas_reserve_bnb,strat_state,archived_at")
      .eq("user_id", userId)
      .limit(1000),
    admin.from("strategies").select("token,wallet_scope,config").eq("user_id", userId).limit(1000),
    admin.from("bot_execution_locks").select("wallet_scope").eq("user_id", userId).limit(1000),
    admin
      .from("execution_submissions")
      .select("wallet_scope")
      .eq("user_id", userId)
      .is("finished_at", null)
      .limit(1000),
  ]);
  if (saved.error || robots.error || added.error || bots.error)
    throw new Error(
      "Não foi possível identificar todas as suas carteiras e ativos. Atualize para tentar novamente.",
    );
  if ([saved, robots, added, bots].some((r) => (r.data?.length ?? 0) >= 1000))
    throw new Error(
      "A lista de carteiras/ativos ultrapassa esta consulta. O total completo não foi calculado.",
    );
  const refs = uniqueFundWallets([
    ...(saved.data ?? []).map((w: any) => ({
      address: w.address,
      label: w.label || "Carteira pessoal",
      personal: true,
      bot: false,
      scopes: [w.id],
    })),
    ...(robots.data ?? []).map((w: any) => ({
      address: w.address,
      label:
        w.wallet_scope === LEGACY_WALLET_SCOPE
          ? "Carteira dos robôs · original"
          : `Carteira dos robôs · ${saved.data?.find((s: any) => s.id === w.wallet_scope)?.label || "adicionada"}`,
      personal: false,
      bot: true,
      scopes: [w.wallet_scope],
    })),
  ]);
  const tracked = [
    ...new Set(
      [
        ...POPULAR_BSC_TOKENS,
        ...(added.data ?? []).map((t: any) => t.address),
        ...(bots.data ?? []).map((b: any) => b.token),
      ].map((a: string) => a.toLowerCase()),
    ),
  ];
  const blockNumber = await pub.getBlockNumber();
  const block = await pub.getBlock({ blockNumber });
  const { tokenMeta } = await import("./tokenMeta.server");
  const metadata = new Map<string, Promise<Awaited<ReturnType<typeof tokenMeta>>>>();
  const meta = (a: string) => {
    if (!metadata.has(a)) metadata.set(a, tokenMeta(a));
    return metadata.get(a)!;
  };
  const rows: FundWallet[] = [];
  // Bound wallet RPC concurrency; a large saved-wallet list must not burst the provider.
  for (const ref of refs) {
    const issues: string[] = [];
    const [balance, scan] = await Promise.allSettled([
      pub.getBalance({ address: getAddress(ref.address), blockNumber }),
      pub.multicall({
        blockNumber,
        allowFailure: true,
        contracts: tracked.map((a) => ({
          address: getAddress(a),
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [getAddress(ref.address)],
        })),
      }),
    ]);
    const bnb = balance.status === "fulfilled" ? formatEther(balance.value) : null;
    if (bnb == null) issues.push("Saldo de BNB indisponível");
    const assets: FundAsset[] = [];
    if (scan.status === "rejected") issues.push("Consulta de tokens indisponível");
    else
      await Promise.all(
        tracked.map(async (address, i) => {
          const r = scan.value[i];
          if (!r || r.status !== "success") {
            assets.push({
              address,
              symbol: address.slice(0, 8) + "…",
              amount: null,
              priceBnb: null,
            });
            return;
          }
          if (r.result === 0n) return;
          try {
            const m = await meta(address);
            assets.push({
              address,
              symbol: m.symbol,
              name: m.name,
              amount: formatUnits(r.result, m.decimals),
              priceBnb: null,
            });
          } catch {
            assets.push({
              address,
              symbol: address.slice(0, 8) + "…",
              amount: null,
              priceBnb: null,
            });
          }
        }),
      );
    const robotScopes = (robots.data ?? [])
      .filter((w: any) => w.address.toLowerCase() === ref.address.toLowerCase())
      .map((w: any) => w.wallet_scope);
    let capital: FundWallet["capital"] = null;
    if (ref.bot && bnb != null && !strategies.error && (strategies.data?.length ?? 0) < 1000) {
      try {
        const list = (bots.data ?? [])
          .filter((b: any) => robotScopes.includes(b.wallet_scope) && !b.archived_at)
          .map((b: any) => ({
            ...b,
            config: strategies.data?.find(
              (s: any) =>
                s.wallet_scope === b.wallet_scope &&
                s.token.toLowerCase() === b.token.toLowerCase(),
            )?.config as Partial<StrategyConfig> | undefined,
          }));
        const c = walletCapital(bnb, list);
        const blocked =
          locks.error ||
          pending.error ||
          (locks.data?.length ?? 0) >= 1000 ||
          (pending.data?.length ?? 0) >= 1000 ||
          [...(locks.data ?? []), ...(pending.data ?? [])].some((l: any) =>
            robotScopes.includes(l.wallet_scope),
          );
        capital = {
          reserved: c.reserved,
          gas: c.gas,
          free: blocked ? null : c.free,
          shortfall: c.shortfall,
        };
      } catch {
        /* Actual holdings remain visible if reservation calculation fails. */
      }
    }
    rows.push({ ...ref, bnb, assets, issues, capital });
  }
  const { readMarket } = await import("./market.server");
  const held = [
    ...new Set(rows.flatMap((w) => w.assets.filter((a) => a.amount != null).map((a) => a.address))),
  ];
  const prices = new Map<string, string | null>();
  const logos = new Map<string, string | null>();
  for (const address of held) {
    if (address === "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c") {
      prices.set(address, "1");
      continue;
    }
    try {
      const market = await readMarket(
        address,
        process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org",
      );
      logos.set(address, market.logoUrl ?? null);
      const p = market.pools.find((p) => p.supported)?.priceNative;
      prices.set(
        address,
        !market.error && p != null && Number(p) > 0 && Number.isFinite(Number(p)) ? p : null,
      );
    } catch {
      prices.set(address, null);
    }
  }
  for (const w of rows)
    for (const a of w.assets) {
      a.priceBnb = prices.get(a.address) ?? null;
      a.logoUrl = logos.get(a.address) ?? null;
    }
  return {
    wallets: rows,
    at: new Date().toISOString(),
    blockNumber: blockNumber.toString(),
    balanceAt: Number(block.timestamp) * 1000,
    trackedTokens: tracked.length,
  };
}
