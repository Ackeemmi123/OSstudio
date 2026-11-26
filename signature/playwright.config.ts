import { defineConfig, devices } from "@playwright/test";

/**
 * The lab, built and served as a visitor gets it. Locally Chrome is used
 * (`channel: "chrome"`); in CI the Playwright Chromium.
 */
const PORT = 4317;

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...(process.env.CI ? {} : { channel: "chrome" }),
    trace: "retain-on-failure",
    // Headless Chrome has no GPU; this lets the `?webgl` tests draw on software WebGL.
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...(process.env.CI ? {} : { channel: "chrome" }) } },
    { name: "phone", use: { ...devices["Pixel 7"], ...(process.env.CI ? {} : { channel: "chrome" }) } },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
