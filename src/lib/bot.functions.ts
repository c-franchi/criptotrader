import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TOKENS } from "./tokens";

export const getBotWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("bot_wallets").select("address").eq("user_id", context.userId).maybeSingle();
    if (!data) return { address: null, bnb: null, tokens: [] as { symbol: string; amount: string }[] };
    const { pubClient } = await import("./bot.server");
    const { erc20Abi } = await import("./pancake");
    const { formatEther, formatUnits } = await import("viem");
    const pub = pubClient();
    const addr = data.address as `0x${string}`;
    try {
      const bnb = formatEther(await pub.getBalance({ address: addr }));
      const tokens = await Promise.all(TOKENS.map(async (t) => ({
        symbol: t.symbol,
        amount: formatUnits(await pub.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [addr] }), t.decimals),
      })));
      return { address: data.address, bnb, tokens };
    } catch {
      return { address: data.address, bnb: null, tokens: [] };
    }
  });

export const createBotWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ex } = await supabaseAdmin.from("bot_wallets").select("address").eq("user_id", context.userId).maybeSingle();
    if (ex) return { address: ex.address };
    const { newEncryptedWallet } = await import("./bot.server");
    const w = await newEncryptedWallet();
    const { error } = await supabaseAdmin.from("bot_wallets").insert({ user_id: context.userId, ...w });
    if (error) throw new Error("Não foi possível criar a carteira do robô");
    await supabaseAdmin.from("audit_log").insert({ user_id: context.userId, action: "bot_wallet_created", details: { address: w.address } });
    return { address: w.address };
  });

/** Sends all bot tokens and BNB (minus gas) back to the wallet registered in Estratégia. */
export const withdrawBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: strat } = await context.supabase.from("strategies").select("tracked_wallet").not("tracked_wallet", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const to = strat?.tracked_wallet;
    if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error("Cadastre a carteira acompanhada em Estratégia primeiro");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("grid_bots").update({ armed: false }).eq("user_id", context.userId);
    const { data: bw } = await supabaseAdmin.from("bot_wallets").select("enc_key").eq("user_id", context.userId).maybeSingle();
    if (!bw) throw new Error("Sem carteira do robô");
    const { botSigner, pubClient } = await import("./bot.server");
    const { erc20Abi } = await import("./pancake");
    const { account, wallet } = await botSigner(bw.enc_key);
    const pub = pubClient();
    const dest = to as `0x${string}`;
    const hashes: string[] = [];
    for (const t of TOKENS) {
      const b = await pub.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      if (b > 0n) {
        const h = await wallet.writeContract({ address: t.address, abi: erc20Abi, functionName: "transfer", args: [dest, b] });
        await pub.waitForTransactionReceipt({ hash: h });
        hashes.push(h);
      }
    }
    const gasPrice = await pub.getGasPrice();
    const fee = gasPrice * 21000n * 2n;
    const bal = await pub.getBalance({ address: account.address });
    if (bal > fee) hashes.push(await wallet.sendTransaction({ to: dest, value: bal - fee }));
    await supabaseAdmin.from("audit_log").insert({ user_id: context.userId, action: "bot_withdraw", details: { to, hashes } });
    return { hashes };
  });

/** Runs one grid step immediately for the caller's bot on the chosen token. */
export const runGridNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => z.object({ token: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tickBot } = await import("./tick.server");
    const { data: bot } = await supabaseAdmin.from("grid_bots").select("*").eq("user_id", context.userId).eq("token", data.token).maybeSingle();
    if (!bot) throw new Error("Salve a grade primeiro");
    return tickBot(supabaseAdmin, bot);
  });
