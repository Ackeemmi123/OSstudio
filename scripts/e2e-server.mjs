#!/usr/bin/env node
/**
 * Builds and starts the app for the end-to-end tests, in one of two modes:
 *
 *   node scripts/e2e-server.mjs supabase 3100   # against the local Supabase stack
 *   node scripts/e2e-server.mjs local 3101      # the local demo, no backend
 *
 * Supabase mode reads the stack's fixed development keys from `supabase status`
 * and refuses anything but localhost. The intake agent uses the deterministic
 * test provider, which uses no AI. LOCAL_SUPABASE_KEYS=new uses the stack's
 * publishable and secret keys instead of the legacy JWT keys, as newer hosted
 * projects do.
 */
import { execFileSync, spawn } from "node:child_process";

const [mode, port] = process.argv.slice(2);
if (!["supabase", "local"].includes(mode) || !port) {
  console.error("Usage: e2e-server.mjs <supabase|local> <port>");
  process.exit(1);
}

const env = { ...process.env, STUDIO_DIST_DIR: `.next-e2e-${mode}`, NEXT_TELEMETRY_DISABLED: "1" };
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]) {
  delete env[key];
}

if (mode === "supabase") {
  const raw = execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(status.API_URL)) {
    console.error(`Refusing to run against ${status.API_URL}: only a local Supabase stack is allowed.`);
    process.exit(1);
  }
  const newKeys = process.env.LOCAL_SUPABASE_KEYS === "new";
  Object.assign(env, {
    NEXT_PUBLIC_STUDIO_DATA_MODE: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: newKeys ? status.PUBLISHABLE_KEY : status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: newKeys ? status.SECRET_KEY : status.SERVICE_ROLE_KEY,
    STUDIO_AGENT_PROVIDER: "fixture",
    STUDIO_ALLOW_TEST_PROVIDER: "1",
  });
} else {
  env.NEXT_PUBLIC_STUDIO_DATA_MODE = "local";
}

if (!process.env.E2E_SKIP_BUILD) {
  execFileSync("npx", ["next", "build"], { env, stdio: "inherit" });
}
const server = spawn("npx", ["next", "start", "-p", port], { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
