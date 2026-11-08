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
      supabaseAdmin
        .from("execution_submissions" as never)
        .select("id")
        .limit(1),
      supabaseAdmin.from("internal_tokens").select("name").eq("name", "grid_tick").limit(1),
      probeRobotRpc(),
    ]);
    const [heartbeatResult, watchedResult] = await Promise.all([
      supabaseAdmin
        .from("market_candle_heartbeat" as never)
        .select("last_invoked_at,last_success_at,claimed,saved,backfilled,failed")
        .eq("id", 1)
        .maybeSingle(),
      supabaseAdmin
        .from("market_candle_watch" as never)
        .select("pool,last_success_at,last_error,last_candle_at")
        .limit(50),
    ]);
    const heartbeat = heartbeatResult.data as {
      last_invoked_at?: string;
      claimed?: number;
      saved?: number;
      backfilled?: number;
      failed?: number;
    } | null;
    const lastHeartbeat = heartbeat?.last_invoked_at ? Date.parse(heartbeat.last_invoked_at) : 0;
    const schedulerFresh =
      Number.isFinite(lastHeartbeat) &&
      lastHeartbeat > 0 &&
      Date.now() - lastHeartbeat < 4 * 60_000;
    const watched = (watchedResult.data ?? []) as {
      pool: string;
      last_success_at: string | null;
      last_error: string | null;
      last_candle_at: number | null;
    }[];
    // A successful provider request does not mean the returned OHLCV is recent.
    // Use the timestamp of the actual stored market bar for freshness.
    const latestCandleAt = Math.max(
      0,
      ...watched.map((row) => {
        const seconds = Number(row.last_candle_at);
        return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
      }),
    );
    const recentCandles =
      latestCandleAt > 0 &&
      latestCandleAt <= Date.now() + 5 * 60_000 &&
      Date.now() - latestCandleAt < 20 * 60_000;
    const [accountingHealth, pendingAccounting] = await Promise.all([
      supabaseAdmin
        .from("accounting_worker_heartbeat" as never)
        .select("last_run_at,verified,pending,errors")
        .eq("id", 1)
        .maybeSingle(),
      supabaseAdmin
        .from("order_accounting_retry" as never)
        .select("order_id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("resolved_at", null),
    ]);
    const accountingHeartbeat = accountingHealth.data as {
      last_run_at?: string;
      verified?: number;
      pending?: number;
      errors?: number;
    } | null;
    const accountingLast = accountingHeartbeat?.last_run_at
      ? Date.parse(accountingHeartbeat.last_run_at)
      : 0;
    const accountingRunning =
      Number.isFinite(accountingLast) &&
      accountingLast > 0 &&
      Date.now() - accountingLast < 6 * 60_000;
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
        text:
          !botError && !journalError
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
        text:
          active.length === 0
            ? "Nenhum robô ligado nesta conta"
            : `${recent} de ${active.length} robôs ligados foram avaliados nos últimos 3 minutos`,
      },
      {
        name: "Condição dos robôs ligados",
        ok: active.length === 0 ? null : problemCount === 0,
        text:
          active.length === 0
            ? "Nenhum robô ligado nesta conta"
            : `${active.length - problemCount} sem erro · ${problemCount} com erro. Ligado não garante execução de ordens.`,
      },
      {
        name: "Arquivo de velas no PostgreSQL",
        ok: !heartbeatResult.error && !watchedResult.error,
        text:
          heartbeatResult.error || watchedResult.error
            ? "Arquivo não instalado ou banco do workspace incorreto. Aplicar migração 0022."
            : `${watched.length} mercados cadastrados. Velas antigas ficam gravadas no servidor.`,
      },
      {
        name: "Fonte secundária de gráfico 5m",
        ok: process.env["DEXPAPRIKA_API_KEY"] ? null : false,
        text: process.env["DEXPAPRIKA_API_KEY"]
          ? "Chave DexPaprika configurada; requer plano Dev/Pro para OHLCV de 5 minutos. Acesso e cobertura dependem de teste real. Consulta somente para gráficos, nunca para o executor."
          : "Sem chave DexPaprika Dev/Pro. O gráfico usa GeckoTerminal e mantém as últimas velas verificadas; a segunda fonte pode ser habilitada no servidor.",
      },
      {
        name: "Coleta de velas com aplicativo fechado",
        ok: heartbeatResult.error ? false : schedulerFresh,
        text: !heartbeat
          ? "Nenhuma execução registrada. Confira o job market-candle-tick no agendador do banco."
          : `Última execução: ${new Date(lastHeartbeat).toLocaleString("pt-BR")}. ${heartbeat.claimed ?? 0} mercados processados, ${heartbeat.failed ?? 0} falhas. ${schedulerFresh ? "Agendador recente." : "Agendador atrasado ou parado."}`,
      },
      {
        name: "Recuperação do histórico",
        ok: watched.length === 0 ? null : recentCandles,
        text:
          watched.length === 0
            ? "Abra o gráfico do ativo uma vez para cadastrá-lo no arquivo contínuo."
            : `Última vela real armazenada em ${latestCandleAt ? new Date(latestCandleAt).toLocaleString("pt-BR") : "horário não encontrado"}. Consultas bem-sucedidas à fonte não garantem velas atualizadas.`,
      },
      {
        name: "Fila de conciliação BNB no banco",
        ok: !accountingHealth.error && !pendingAccounting.error,
        text:
          accountingHealth.error || pendingAccounting.error
            ? "Fila de auditoria não instalada ou banco do workspace incorreto (migração 0023)."
            : `${pendingAccounting.count ?? 0} vendas na fila aguardando prova. Fila acessível não significa lucro confirmado nem agendador ativo.`,
      },
      {
        name: "Conciliação automática com aplicativo fechado",
        ok: accountingHealth.error ? false : accountingRunning,
        text: !accountingHeartbeat
          ? "Nenhum processamento registrado. Confirme o job accounting-tick no banco."
          : `Última execução: ${new Date(accountingLast).toLocaleString("pt-BR")}. ${accountingHeartbeat.verified ?? 0} apurados, ${accountingHeartbeat.pending ?? 0} pendentes. ${accountingRunning ? "Ativo." : "Atrasado ou parado."}`,
      },
      {
        name: "Rastreamento histórico de vendas GTE",
        ok: process.env["BSC_TRACE_RPC_URL"] ? null : false,
        text: process.env["BSC_TRACE_RPC_URL"]
          ? "Provedor adicional configurado, mas a cobertura de debug_traceTransaction histórico ainda precisa ser comprovada por leitura. Não confirma valores."
          : "BSC_TRACE_RPC_URL não configurado. Vendas antigas permanecem pendentes sem prova nativa compatível.",
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
