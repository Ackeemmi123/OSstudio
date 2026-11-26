import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e-*/**",
    "playwright-report/**",
    "test-results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Axivo Signature builds and tests itself (signature/package.json); only its sources are linted here.
    "signature/dist/**",
    "signature/test-results/**",
    "signature/playwright-report/**",
    "signature/lighthouse/**",
  ]),
]);

export default eslintConfig;
