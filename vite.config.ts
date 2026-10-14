// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // WalletConnect expects Node's `events`/`buffer` in the browser; use the npm polyfills.
    plugins: [
      {
        name: "browser-node-polyfills",
        enforce: "pre",
        resolveId(id) {
          if (this.environment?.name !== "client") return null;
          if (id === "events" || id === "node:events") return fileURLToPath(new URL("./node_modules/events/events.js", import.meta.url));
          if (id === "buffer" || id === "node:buffer") return fileURLToPath(new URL("./node_modules/buffer/index.js", import.meta.url));
          return null;
        },
      },
    ],
    optimizeDeps: { include: ["events", "buffer"] },
  },
});
