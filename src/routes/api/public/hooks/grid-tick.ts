import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/grid-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const h = (v: string) => createHash("sha256").update(v).digest();
        // Accepts the managed scheduler secret or the internal token stored in the database.
        const cron = process.env["LOVABLE_CRON_SECRET"];
        let ok = !!cron && timingSafeEqual(h(token), h(cron));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!ok) {
          const { data } = await supabaseAdmin.from("internal_tokens").select("token").eq("name", "grid_tick").maybeSingle();
          ok = !!data && timingSafeEqual(h(token), h(data.token));
        }
        if (!ok) return new Response("Unauthorized", { status: 401 });
        const { tickAll } = await import("@/lib/tick.server");
        const n = await tickAll(supabaseAdmin);
        return Response.json({ ok: true, bots: n });
      },
    },
  },
});
