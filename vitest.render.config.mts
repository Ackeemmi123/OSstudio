import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Draws the preview's pages to a file, for the accessibility test in Playwright. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/e2e/render/*.render.ts"],
    environment: "node",
  },
});
