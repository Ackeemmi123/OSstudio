import { createClient } from "@supabase/supabase-js";
import { serverSupabase } from "@/server/config";
import { BUILD_BUCKET } from "@/server/site-builds/build";
import { serveBuild } from "@/server/site-builds/serve";

/**
 * A built site behind its private link: /s/<token>/ and the pages under it.
 * No sign-in: the long random token is the key, and it expires or can be
 * turned off. Only the server reads the stored files.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token, path = [] } = await params;
  const supabase = serverSupabase();
  if (!supabase.ok) return new Response("Not available.", { status: 503 });
  const asServer = createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return serveBuild(token, path, {
    find: async (value) => {
      const { data } = await asServer.rpc("site_build_by_token", { p_token: value });
      const found = (data as { storage_prefix: string; expires_at: string; revoked_at: string | null }[] | null)?.[0];
      return found ? { storagePrefix: found.storage_prefix, expiresAt: found.expires_at, revokedAt: found.revoked_at } : null;
    },
    read: async (file) => {
      const { data, error } = await asServer.storage.from(BUILD_BUCKET).download(file);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    now: () => new Date(),
  });
}
