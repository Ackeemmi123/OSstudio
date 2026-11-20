import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/site-assets/limits";
import { DOCUMENT_BUCKET } from "@/server/site-documents/upload";
import type { BuildDeps, StoredImage } from "./build";

/**
 * What a build reads: the client's images and documents. Records are read as
 * the person, so the database decides what they may use; files are
 * downloaded by the server, since no person may read them directly.
 */
export function buildDeps(asUser: SupabaseClient, asServer: SupabaseClient, studioId: string, clientId: string): BuildDeps {
  return {
    images: async (ids) => {
      if (!ids.length) return [];
      const { data, error } = await asUser.from("site_assets").select("id, storage_path, mime_type, status").eq("studio_id", studioId).eq("client_id", clientId).in("id", ids);
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id, storagePath: row.storage_path, mimeType: row.mime_type, status: row.status }) as StoredImage);
    },
    download: async (path) => {
      const { data, error } = await asServer.storage.from(STORAGE_BUCKET).download(path);
      if (error || !data) throw error ?? new Error("Empty image.");
      return new Uint8Array(await data.arrayBuffer());
    },
    documents: async (ids) => {
      const { data, error } = await asUser.from("site_documents").select("id, storage_path, deleted_at").eq("studio_id", studioId).eq("client_id", clientId).in("id", ids);
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id, storagePath: row.storage_path, deleted: row.deleted_at !== null }));
    },
    downloadDocument: async (path) => {
      const { data, error } = await asServer.storage.from(DOCUMENT_BUCKET).download(path);
      if (error || !data) throw error ?? new Error("Empty document.");
      return new Uint8Array(await data.arrayBuffer());
    },
    now: () => new Date(),
  };
}
