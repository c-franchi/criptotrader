import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/mobile-dialogs",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  workers: process.env["CI"] ? 2 : 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { launchOptions: { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] } }
      : {}),
  },
  projects: [
    {
      name: "mobile-360",
      use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
    },
    {
      name: "mobile-390",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: "mobile-short",
      use: { viewport: { width: 390, height: 420 }, isMobile: true, hasTouch: true },
    },
    { name: "landscape", use: { viewport: { width: 844, height: 390 }, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "bun run test:ui:serve",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
