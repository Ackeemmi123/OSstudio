import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** The local stack's URL and fixed development keys. Never a hosted project. */
export function localSupabase() {
  const raw = execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const status = JSON.parse(raw.slice(raw.indexOf("{"))) as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(status.API_URL)) throw new Error(`Refusing to seed ${status.API_URL}: only a local Supabase stack is allowed.`);
  return { url: status.API_URL, anonKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY };
}

export interface SeedUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

export interface Fixture {
  url: string;
  anonKey: string;
  studioA: string;
  studioB: string;
  owner: SeedUser;
  member: SeedUser;
  viewer: SeedUser;
  outsider: SeedUser;
  /** A client in studio B, which studio A's people must not reach. */
  foreignClientId: string;
}

const FIXTURE_FILE = path.join(__dirname, ".state", "fixture.json");

export function saveFixture(fixture: Fixture) {
  mkdirSync(path.dirname(FIXTURE_FILE), { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2));
}

export function fixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as Fixture;
}

/** A Supabase client signed in as one of the seeded people, for checks that bypass the UI. */
export async function signedInClient(user: SeedUser): Promise<SupabaseClient> {
  const { url, anonKey } = fixture();
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}
