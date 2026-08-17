/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

// The E2E suite runs against the packaged Quarkus app (prod profile). Playwright starts it
// automatically via webServer; set PLAYWRIGHT_BASE_URL to reuse an already-running instance.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080";
const apiKey = process.env.PLAYWRIGHT_API_KEY || "e2e-test-key";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    // The %prod profile gates every endpoint behind UTILITY_API_KEY; the webServer below starts
    // the app with the same key, so all requests (API + console) carry it. Override both with
    // PLAYWRIGHT_API_KEY / PLAYWRIGHT_BASE_URL when testing against an externally-managed app.
    extraHTTPHeaders: { Authorization: `Bearer ${apiKey}` },
    trace: "on",
    video: "on",
    screenshot: "on",
    viewport: { width: 1280, height: 720 },
  },
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: "java -jar target/quarkus-app/quarkus-run.jar",
          cwd: "..",
          // env passed explicitly (not a shell prefix) so the same config works on
          // Windows cmd, POSIX shells, and CI runners alike.
          env: {
            UTILITY_API_KEY: apiKey,
            UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE: "0",
          },
          url: `${baseURL}/q/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
