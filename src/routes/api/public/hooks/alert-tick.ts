import { createFileRoute } from "@tanstack/react-router";

// Public by design (scheduler can't send secrets). Safe: it only reads public
// prices and notifies each user's own devices; state changes dedupe messages
// and rows checked in the last 40s are skipped, so extra calls do nothing.
export const Route = createFileRoute("/api/public/hooks/alert-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { runAlertTick } = await import("@/lib/alertTick.server");
        return Response.json(await runAlertTick());
      },
    },
  },
});
