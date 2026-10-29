import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** The intake agent's evaluation set (`npm run eval:intake`). See docs/ai.md. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/eval/**/*.eval.ts"],
    environment: "node",
    testTimeout: 15 * 60_000,
  },
});
