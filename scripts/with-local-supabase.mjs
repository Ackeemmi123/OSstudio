#!/usr/bin/env node
/**
 * Runs a command with the local Supabase stack's URL and keys in the
 * environment. The keys printed by `supabase status` are the fixed local
 * development keys, not secrets. Refuses to run against anything but localhost.
 * LOCAL_SUPABASE_KEYS=new uses the publishable and secret keys instead of the
 * legacy JWT keys, as newer hosted projects do.
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

const newKeys = process.env.LOCAL_SUPABASE_KEYS === "new";
const anonKey = newKeys ? status.PUBLISHABLE_KEY : status.ANON_KEY;
const serviceKey = newKeys ? status.SECRET_KEY : status.SERVICE_ROLE_KEY;
const env = {
  ...process.env,
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  // The staging smoke test, pointed at the local stack.
  STAGING_SUPABASE_URL: status.API_URL,
  STAGING_SUPABASE_ANON_KEY: anonKey,
  STAGING_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  STAGING_DATABASE_URL: status.DB_URL,
};
const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command, args, { env, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
