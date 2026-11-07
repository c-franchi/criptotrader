import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/accounting-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const h = (value: string) => createHash("sha256").update(value).digest();
        const cron = process.env["LOVABLE_CRON_SECRET"];
        let authorized = !!cron && timingSafeEqual(h(token), h(cron));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!authorized) {
          const { data } = await supabaseAdmin
            .from("internal_tokens")
            .select("token")
            .eq("name", "grid_tick")
            .maybeSingle();
          authorized = !!data?.token && timingSafeEqual(h(token), h(data.token));
        }
        if (!authorized) return new Response("Unauthorized", { status: 401 });
        try {
          const [{ tickAccounting }, { pubClient }] = await Promise.all([
            import("@/lib/accountingWorker.server"),
            import("@/lib/bot.server"),
          ]);
          const outcome = await tickAccounting(supabaseAdmin, pubClient());
          return Response.json(outcome, { status: 200 });
        } catch {
          return new Response("Serviço de conciliação indisponível ou não instalado", {
            status: 503,
          });
        }
      },
    },
  },
});
