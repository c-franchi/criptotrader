import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getIntegrationHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (context.claims.email !== "neifranchi@gmail.com") throw new Error("Acesso restrito");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { probeRobotRpc } = await import("./robotRpc.server");
    const [
      { data: bots, error: botError },
      { error: journalError },
      { data: scheduledTokens, error: tokensError },
      rpcProbes,
    ] = await Promise.all([
      supabaseAdmin
        .from("grid_bots")
        .select("armed,last_run_at,last_error")
        .eq("user_id", context.userId),
      supabaseAdmin.from("execution_submissions" as never).select("id").limit(1),
      supabaseAdmin.from("internal_tokens").select("name").eq("name", "grid_tick").limit(1),
      probeRobotRpc(),
    ]);
    const active = (bots ?? []).filter((b) => b.armed);
    const last = active.map((b) => (b.last_run_at ? new Date(b.last_run_at).getTime() : 0));
    const problemCount = active.filter((b) => !!b.last_error).length;
    const recent = last.filter((t) => Date.now() - t < 180_000 && t <= Date.now()).length;
    const rpcText = rpcProbes
      .map((p) => {
        const age = p.blockAgeMs == null ? "" : ` · bloco ${Math.round(p.blockAgeMs / 1000)}s`;
        return `${p.alias}: ${p.ok ? "disponível" : p.reason}${age}`;
      })
      .join(" | ");

    return [
      {
        name: "Rede BSC · leitura",
        ok: rpcProbes.some((p) => p.ok),
        text: rpcText || "Nenhum provedor configurado",
      },
      {
        name: "RPC principal · envio de transações",
        ok: !!rpcProbes[0]?.ok,
        text: "Fallback serve somente para leitura. Operações reais dependem do provedor principal.",
      },
      {
        name: "Banco e diário de execução",
        ok: !botError && !journalError,
        text: !botError && !journalError
          ? "Conexão e estrutura de conciliação acessíveis"
          : "Falha ao consultar robôs ou diário; confira o banco conectado ao workspace",
      },
      {
        name: "Autorização do agendador",
        ok: !!process.env["LOVABLE_CRON_SECRET"] || (!tokensError && !!scheduledTokens?.length),
        text: "Verifica se existe uma credencial de agendamento, sem revelá-la. Não comprova que o cron esteja disparando.",
      },
      {
        name: "Agendamento dos robôs",
        ok: active.length === 0 ? null : recent === active.length,
        text: active.length === 0
          ? "Nenhum robô ligado nesta conta"
          : `${recent} de ${active.length} robôs ligados foram avaliados nos últimos 3 minutos`,
      },
      {
        name: "Condição dos robôs ligados",
        ok: active.length === 0 ? null : problemCount === 0,
        text: active.length === 0
          ? "Nenhum robô ligado nesta conta"
          : `${active.length - problemCount} sem erro · ${problemCount} com erro. Ligado não garante execução de ordens.`,
      },
      {
        name: "Criptografia do executor",
        ok: !!process.env["BOT_KEY_SECRET"],
        text: "Chave do executor presente no workspace. Nenhum segredo é enviado ao navegador.",
      },
      {
        name: "Entrega de notificações",
        ok: !!process.env["LOVABLE_API_KEY"] && !!process.env["FIREBASE_MESSAGING_API_KEY"],
        text: "Configuração presente não confirma a entrega no aparelho",
      },
    ];
  });
