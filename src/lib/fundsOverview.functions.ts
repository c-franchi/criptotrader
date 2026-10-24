import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
type Report = Awaited<ReturnType<typeof import("./fundsOverview.server").readFundsOverview>>;
const pending = new Map<string, Promise<Report>>();
export const getFundsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const running = pending.get(userId);
    if (running) return running;
    const request = (async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { pubClient } = await import("./bot.server");
      const { readFundsOverview } = await import("./fundsOverview.server");
      return readFundsOverview(supabaseAdmin, pubClient(), userId);
    })().finally(() => pending.delete(userId));
    pending.set(userId, request);
    return request;
  });
