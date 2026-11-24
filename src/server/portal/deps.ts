import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { checkMaterial, MATERIAL_BUCKET } from "@/server/client-materials/files";
import { serverSupabase } from "@/server/config";
import { notifyPortalEvent } from "@/server/reminders/send";
import type { PortalDeps, PortalState } from "./portal";

const EXTENSION: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The portal's requests through the service role, which only the server holds. With `origin`, members are e-mailed after the response. */
export function portalDeps(origin?: string): PortalDeps | null {
  const supabase = serverSupabase();
  if (!supabase.ok) return null;
  const db = createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    state: async (token) => {
      const { data, error } = await db.rpc("client_portal_state", { p_token: token });
      if (error) throw error;
      return (data as PortalState | null) ?? null;
    },
    answers: async (token, answers) => db.rpc("record_portal_answers", { p_token: token, p_answers: answers }),
    claim: async (token, bytes) => db.rpc("claim_portal_upload", { p_token: token, p_bytes: bytes }),
    store: async (target, bytes, title, author) => {
      const checked = checkMaterial(bytes, title);
      if (!checked.ok) return { ok: false, reason: bytes.byteLength > 4 * 1024 * 1024 ? "size" : "type" };
      const id = randomUUID();
      const storagePath = `${target.studioId}/${target.clientId}/${id}.${EXTENSION[checked.type]}`;
      const { error: storeError } = await db.storage.from(MATERIAL_BUCKET).upload(storagePath, bytes, { contentType: checked.type, upsert: false });
      if (storeError) return { ok: false, reason: "failed" };
      const { error } = await db.rpc("record_client_material", {
        p_material: { id, studio_id: target.studioId, client_id: target.clientId, storage_path: storagePath, title: checked.title, mime_type: checked.type, byte_size: bytes.byteLength, sha256: checked.sha256, added_by: { kind: "human", name: `${author.slice(0, 100)} (kunden, via portalen)` } },
      });
      return error ? { ok: false, reason: "failed" } : { ok: true };
    },
    note: async (token, author, note) => db.rpc("record_portal_files_note", { p_token: token, p_author: author, p_note: note }),
    notify: origin ? (token, event) => after(() => notifyPortalEvent(token, event, origin)) : undefined,
  };
}
