import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/grid-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Server-only token generated inside the database; the scheduler reads the same row.
        const { data } = await supabaseAdmin.from("internal_tokens").select("token").eq("name", "grid_tick").maybeSingle();
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const h = (v: string) => createHash("sha256").update(v).digest();
        if (!data || !timingSafeEqual(h(token), h(data.token))) return new Response("Unauthorized", { status: 401 });
        const { tickAll } = await import("@/lib/tick.server");
        const n = await tickAll(supabaseAdmin);
        return Response.json({ ok: true, bots: n });
      },
    },
  },
});
