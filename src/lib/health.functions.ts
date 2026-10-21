import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const getIntegrationHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (context.claims.email !== "neifranchi@gmail.com") throw new Error("Acesso restrito");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pubClient } = await import("./bot.server");
    const [{ data: bots, error: botError }, { error: journalError }, rpc] = await Promise.all([
      supabaseAdmin.from("grid_bots").select("armed,last_run_at").eq("user_id", context.userId),
      supabaseAdmin
        .from("execution_submissions" as never)
        .select("id")
        .limit(1),
      pubClient()
        .getBlockNumber()
        .then(() => true)
        .catch(() => false),
    ]);
    const last = (bots ?? [])
      .filter((b) => b.armed)
      .map((b) => (b.last_run_at ? new Date(b.last_run_at).getTime() : 0));
    return [
      {
        name: "Rede BSC",
        ok: rpc,
        text: rpc ? "RPC respondeu à consulta de bloco" : "RPC indisponível agora",
      },
      {
        name: "Banco e diário de execução",
        ok: !botError && !journalError,
        text: !journalError
          ? "Estrutura de conciliação disponível"
          : "Migração do diário pendente ou consulta indisponível",
      },
      {
        name: "Agendamento dos robôs",
        ok: last.length === 0 ? null : last.every((t) => Date.now() - t < 180000),
        text:
          last.length === 0
            ? "Nenhum robô ligado nesta conta"
            : "Estado calculado pela última verificação dos robôs ligados",
      },
      {
        name: "Criptografia do executor",
        ok: !!process.env["BOT_KEY_SECRET"],
        text: "Verifica apenas presença da configuração; nenhum segredo é enviado ao navegador",
      },
      {
        name: "Entrega de notificações",
        ok: !!process.env["LOVABLE_API_KEY"] && !!process.env["FIREBASE_MESSAGING_API_KEY"],
        text: "Configuração presente não confirma a entrega no aparelho",
      },
    ];
  });
