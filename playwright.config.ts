import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. The "supabase" project runs against the local Supabase
 * stack (`npm run db:start`) with the intake agent's test provider, which uses
 * no AI. The "local-demo" project checks the backend-free demo.
 */
const SUPABASE_PORT = 3100;
const LOCAL_PORT = 3101;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "supabase", testIgnore: /local-demo\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${SUPABASE_PORT}` } },
    { name: "local-demo", testMatch: /local-demo\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${LOCAL_PORT}` } },
  ],
  webServer: [
    {
      command: `node scripts/e2e-server.mjs supabase ${SUPABASE_PORT}`,
      url: `http://127.0.0.1:${SUPABASE_PORT}/api/agents/status`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
    {
      command: `node scripts/e2e-server.mjs local ${LOCAL_PORT}`,
      url: `http://127.0.0.1:${LOCAL_PORT}`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
  ],
});
