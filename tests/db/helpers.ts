import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "@/lib/data/supabase-repository";

/**
 * Helpers for the database tests. They run against a real Supabase stack
 * (`npm run db:start`), never a hosted project: they create users and studios.
 */
export const env = {
  url: required("SUPABASE_URL"),
  anonKey: required("SUPABASE_ANON_KEY"),
  serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run the database tests with \`npm run test:db\`, which reads them from the local Supabase stack.`);
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(process.env.SUPABASE_URL ?? "")) {
    throw new Error("Database tests only run against a local Supabase stack.");
  }
  return value;
}

export const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

export function anonClient(): SupabaseClient {
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const run = Math.random().toString(36).slice(2, 8);
let counter = 0;

export async function createUser(name: string): Promise<TestUser> {
  const email = `${name}-${run}-${++counter}@studio-os.test`;
  const password = "test-password-123";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}

export async function createStudio(owner: TestUser, name = "Test studio"): Promise<string> {
  const { data, error } = await owner.client.rpc("create_studio", { p_name: name, p_display_name: "Owner" });
  if (error) throw error;
  return data as string;
}

export async function addMember(owner: TestUser, studioId: string, user: TestUser, role: "owner" | "member" | "viewer", displayName = role) {
  const { error } = await owner.client.rpc("add_studio_member", { p_studio: studioId, p_email: user.email, p_display_name: displayName, p_role: role });
  if (error) throw error;
}

export function repositoryFor(user: TestUser, studioId: string): SupabaseRepository {
  return new SupabaseRepository({ client: user.client, studioId, user: { id: user.id, email: user.email } });
}
