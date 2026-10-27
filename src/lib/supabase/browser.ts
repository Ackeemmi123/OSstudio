import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: { key: string; instance: SupabaseClient } | null = null;

/**
 * The browser's Supabase client: the public anon key plus the signed-in
 * user's session. Every query runs under row-level security as that user.
 */
export function getBrowserSupabase(url: string, anonKey: string): SupabaseClient {
  const key = `${url}|${anonKey}`;
  if (client?.key !== key) {
    client = {
      key,
      instance: createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "studio-os:auth" },
      }),
    };
  }
  return client.instance;
}
