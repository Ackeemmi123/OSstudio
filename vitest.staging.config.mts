import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** The staging smoke test: writes test data to a hosted staging project (`npm run staging:smoke`). */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/staging/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
