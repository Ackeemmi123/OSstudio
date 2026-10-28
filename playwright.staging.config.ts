import { defineConfig, devices } from "@playwright/test";

/**
 * The real-data browser journey against the deployed staging app
 * (`npm run staging:e2e`). It starts no server and seeds nothing: it signs in
 * to an existing staging test account and adds one client with source
 * material to a dedicated studio. See docs/staging.md for the variables.
 */
export default defineConfig({
  testDir: "tests/staging-e2e",
  outputDir: "test-results/staging",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.STAGING_APP_URL?.trim().replace(/\/+$/, "") || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
