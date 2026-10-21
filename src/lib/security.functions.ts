import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scanBytecode } from "./safety";

/** Reads the token bytecode on-chain and lists risky owner powers. */
export const checkContractRisk = createServerFn({ method: "GET" })
  .inputValidator((d: { address: string }) =>
    z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const url = process.env["BSC_RPC_URL"] || "https://bsc-dataseed.bnbchain.org";
    const call = async (method: string, params: unknown[]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(8000),
      });
      const j = (await res.json()) as { result?: string; error?: unknown };
      if (j.error || !j.result) throw new Error("rpc");
      return j.result;
    };
    try {
      const code = await call("eth_getCode", [data.address, "latest"]);
      if (code.length <= 2) return { ok: false as const, risks: [], owner: null, renounced: null };
      let owner: string | null = null;
      try {
        const o = await call("eth_call", [{ to: data.address, data: "0x8da5cb5b" }, "latest"]);
        owner = "0x" + o.slice(-40);
      } catch {
        /* no owner() */
      }
      const renounced = owner == null ? null : /^0x0{40}$|^0x0{36}dead$/i.test(owner);
      return { ok: true as const, risks: scanBytecode(code), owner, renounced };
    } catch {
      return { ok: false as const, risks: [], owner: null, renounced: null };
    }
  });

/** Alerts the user (bell + push) right after a withdrawal wallet is saved. */
export const notifyWalletSaved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { address: string }) =>
    z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("user_wallets")
      .select("address, created_at")
      .ilike("address", data.address)
      .maybeSingle();
    if (!row || Date.now() - new Date(row.created_at).getTime() > 10 * 60 * 1000)
      return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const short = `${row.address.slice(0, 6)}…${row.address.slice(-4)}`;
    const title = "Nova carteira salva na sua conta";
    const body = `${short} foi adicionada. Ela só poderá receber saques do robô daqui a 24h. Se não foi você, remova-a agora e troque sua senha.`;
    await supabaseAdmin
      .from("notifications")
      .insert({ user_id: context.userId, title, body, link: "/carteiras" });
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: "wallet_saved",
      details: { address: row.address },
    });
    // Durable notification outbox is delivered by alert-tick.
    return { ok: true };
  });
