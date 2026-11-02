import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Database tests: run against a local Supabase stack (`npm run test:db`). */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The server routes the tests call directly.
      "server-only": fileURLToPath(new URL("./tests/db/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
