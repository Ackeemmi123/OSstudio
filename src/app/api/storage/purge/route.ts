import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/site-assets/limits";
import { logAgentError } from "@/server/agents/agent-request";
import { serverSupabase } from "@/server/config";
import { purgeQueuedFiles, purgeSiteAssets } from "@/server/storage/purge";

export const maxDuration = 60;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The daily purge of image files and queued files (src/server/storage/purge.ts), called by Vercel Cron
 * with `Authorization: Bearer $CRON_SECRET`. Off until CRON_SECRET (at least
 * 32 characters) is set. Logs counts only.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return Response.json({ error: "not_configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const supabase = serverSupabase();
  if (!supabase.ok) return Response.json({ error: "not_configured" }, { status: 503 });

  const asServer = createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const report = await purgeSiteAssets({
      due: async (limit) => {
        const { data, error } = await asServer.rpc("site_assets_due_for_purge", { p_limit: limit });
        if (error) throw error;
        return data as { id: string; storage_path: string }[];
      },
      remove: async (paths) => {
        const { error } = await asServer.storage.from(STORAGE_BUCKET).remove(paths);
        if (error) throw error;
      },
      forget: async (ids) => {
        const { data, error } = await asServer.rpc("forget_purged_site_assets", { p_ids: ids });
        if (error) throw error;
        return Number(data ?? 0);
      },
    });
    const queued = await purgeQueuedFiles({
      due: async (limit) => {
        const { data, error } = await asServer.rpc("storage_files_due_for_purge", { p_limit: limit });
        if (error) throw error;
        return data as { id: number; bucket: string; path: string; is_prefix: boolean }[];
      },
      list: async (bucket, prefix) => {
        // Folders come back without an id; walk into them.
        const files: string[] = [];
        const walk = async (folder: string) => {
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await asServer.storage.from(bucket).list(folder, { limit: 1000, offset });
            if (error) throw error;
            for (const entry of data ?? []) {
              const path = `${folder}/${entry.name}`;
              if (entry.id) files.push(path);
              else await walk(path);
            }
            if ((data ?? []).length < 1000) break;
          }
        };
        await walk(prefix.replace(/\/$/, ""));
        return files;
      },
      remove: async (bucket, paths) => {
        if (!paths.length) return;
        const { error } = await asServer.storage.from(bucket).remove(paths);
        if (error) throw error;
      },
      forget: async (ids) => {
        const { data, error } = await asServer.rpc("forget_purged_storage_files", { p_ids: ids });
        if (error) throw error;
        return Number(data ?? 0);
      },
    });
    console.info("[storage] purge", report, "queued", queued);
    return Response.json({ ...report, queued });
  } catch (failure) {
    logAgentError("[storage] purge failed", failure);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
