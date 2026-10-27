#!/usr/bin/env node
/**
 * Runs a command with the local Supabase stack's URL and keys in the
 * environment. The keys printed by `supabase status` are the fixed local
 * development keys, not secrets. Refuses to run against anything but localhost.
 *
 *   node scripts/with-local-supabase.mjs vitest run -c vitest.db.config.mts
 */
import { execFileSync, spawnSync } from "node:child_process";

const raw = execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const status = JSON.parse(raw.slice(raw.indexOf("{")));
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(status.API_URL)) {
  console.error(`Refusing to run against ${status.API_URL}: only a local Supabase stack is allowed.`);
  process.exit(1);
}

const env = {
  ...process.env,
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
};
const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command, args, { env, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
