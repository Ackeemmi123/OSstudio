import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** The website proof: writes sites to proof/out, or tests the design system. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["proof/**/*.render.ts", "proof/**/*.test.ts", "design-systems/**/*.test.tsx"],
    environment: "node",
  },
});
