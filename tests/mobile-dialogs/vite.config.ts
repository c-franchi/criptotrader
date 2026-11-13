import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  envPrefix: "ISOLATED_UI_TEST_",
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@/lib/fx.functions": fileURLToPath(new URL("./fx-stub.ts", import.meta.url)),
      "@/lib/history.functions": fileURLToPath(new URL("./history-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
});
