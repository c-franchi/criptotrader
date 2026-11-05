import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/candle-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const hash = (value: string) => createHash("sha256").update(value).digest();
        const cron = process.env["LOVABLE_CRON_SECRET"];
        let authorized = !!cron && timingSafeEqual(hash(token), hash(cron));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!authorized) {
          const { data } = await supabaseAdmin
            .from("internal_tokens")
            .select("token")
            .eq("name", "grid_tick")
            .maybeSingle();
          authorized = !!data?.token && timingSafeEqual(hash(token), hash(data.token));
        }
        if (!authorized) return new Response("Unauthorized", { status: 401 });
        try {
          const { tickMarketHistory } = await import("@/lib/historyIngestion.server");
          const result = await tickMarketHistory(supabaseAdmin);
          return Response.json(result, { status: result.failed === 0 ? 200 : 503 });
        } catch {
          return new Response("O serviço de histórico não está configurado ou está indisponível", {
            status: 503,
          });
        }
      },
    },
  },
});
