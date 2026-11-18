import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pdfPageCount, SITE_DRAFT_LIMITS, type DraftFile, type SiteDraftResult } from "@/lib/agents/site-draft";
import type { ProjectType } from "@/lib/domain/types";
import { MATERIAL_BUCKET } from "@/server/client-materials/files";
import type { SiteDraftStore } from "./site-draft-runner";
import { SupabaseIntakeStore } from "./supabase-intake-store";

/** Raw bytes of all files together. Sent as base64, a third larger, well inside the API's request limit. */
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

/**
 * Storage for the website draft. Records are read as the requesting person,
 * so row-level security decides which files the agent may see; the files
 * themselves are downloaded by the server, since no person may read them.
 */
export class SupabaseSiteDraftStore extends SupabaseIntakeStore implements SiteDraftStore {
  constructor(
    private readonly user: SupabaseClient,
    private readonly runner: SupabaseClient,
    private readonly studio: string,
  ) {
    super(user, runner, studio, { id: "design", taskType: "design.site_draft" });
  }

  async loadProject(projectId: string) {
    const { data, error } = await this.user.from("projects").select("client_id, project_type").eq("studio_id", this.studio).eq("id", projectId).maybeSingle();
    if (error) throw error;
    return data ? { clientId: String(data.client_id), projectType: (data.project_type ?? "website") as ProjectType } : null;
  }

  async loadFiles(clientId: string) {
    const { data, error } = await this.user
      .from("client_materials")
      .select("id, title, mime_type, byte_size, sha256, storage_path")
      .eq("studio_id", this.studio)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const files: DraftFile[] = [];
    const skipped: SiteDraftResult["skippedFiles"] = [];
    let bytes = 0;
    let pages = 0;
    for (const row of data ?? []) {
      const title = String(row.title);
      if (files.length >= SITE_DRAFT_LIMITS.files) {
        skipped.push({ id: String(row.id), title, reason: `Only ${SITE_DRAFT_LIMITS.files} files are read per draft.` });
        continue;
      }
      if (bytes + Number(row.byte_size) > MAX_TOTAL_BYTES) {
        skipped.push({ id: String(row.id), title, reason: "The files together are too large for one draft." });
        continue;
      }
      const download = await this.runner.storage.from(MATERIAL_BUCKET).download(String(row.storage_path));
      if (download.error || !download.data) {
        skipped.push({ id: String(row.id), title, reason: "The file could not be read from storage." });
        continue;
      }
      const content = new Uint8Array(await download.data.arrayBuffer());
      const mimeType = row.mime_type as DraftFile["mimeType"];
      const filePages = mimeType === "application/pdf" ? pdfPageCount(content) : 0;
      if (pages + filePages > SITE_DRAFT_LIMITS.pdfPages) {
        skipped.push({ id: String(row.id), title, reason: `Only ${SITE_DRAFT_LIMITS.pdfPages} PDF pages are read per draft.` });
        continue;
      }
      bytes += content.byteLength;
      pages += filePages;
      files.push({ id: String(row.id), title, mimeType, sha256: String(row.sha256), data: Buffer.from(content).toString("base64"), pages: filePages });
    }
    return { files, skipped };
  }
}
